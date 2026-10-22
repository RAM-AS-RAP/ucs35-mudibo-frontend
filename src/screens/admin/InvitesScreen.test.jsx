import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { toast } from 'sonner';
import { server } from '@/test/msw/server';
import { apiUrl, errorResponse, validationErrorResponse } from '@/test/msw/handlers';
import { fixtures } from '@/test/fixtures';
import { logout } from '@/test/render';
import { recordAll } from '@/test/buyer';
import { renderAdmin, rowOf, waitForScreen } from '@/test/admin';
import { EMAIL_FAILURE_MESSAGES } from '@/lib/adminMessages';
import { queryClient } from '@/lib/queryClient';

vi.mock('sonner', async (importOriginal) => {
  const actual = /** @type {typeof import('sonner')} */ (await importOriginal());
  return { ...actual, toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) };
});

/** @type {ReturnType<typeof recordAll>} */
let recorder;
beforeEach(() => {
  recorder = recordAll();
});
afterEach(() => {
  recorder.stop();
  logout();
  queryClient.clear();
  server.events.removeAllListeners();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.useRealTimers();
});

const [pending, used, expired, revoked, locked] = fixtures.adminInvitesPage.items;
const SECRET_CODE = 'QX7KP2ZM';

async function openInvites(path = '/admin/invites') {
  const utils = renderAdmin(path);
  await waitForScreen('Invites', 'Loading invitations…');
  return utils;
}

/** @param {ReturnType<typeof userEvent.setup>} user */
async function fillForm(
  user,
  { name = 'New Admin', phone = '0712 345 678', email = 'new@example.com' } = {},
) {
  await user.click(screen.getByRole('button', { name: 'Send invitation' }));
  const dialog = screen.getByRole('dialog', { name: 'Send an invitation' });
  if (name) await user.type(within(dialog).getByLabelText('Full name'), name);
  if (phone) await user.type(within(dialog).getByLabelText('Phone number'), phone);
  if (email) await user.type(within(dialog).getByLabelText('Email'), email);
  return dialog;
}

/** @param {HTMLElement} dialog */
const submit = (dialog) => within(dialog).getByRole('button', { name: 'Send invitation' });

describe('InvitesScreen: sending an invitation', () => {
  it('sends the normalised phone and shows where the invitation went', async () => {
    const user = userEvent.setup();
    await openInvites();
    const dialog = await fillForm(user);
    await user.click(submit(dialog));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const [call] = recorder.of('POST', '/api/v1/admin/invites');
    expect(JSON.parse(await call.body)).toEqual({
      name: 'New Admin',
      phone_number: '254712345678',
      email: 'new@example.com',
    });
    const result = screen.getByTestId('invite-result');
    expect(result).toHaveTextContent(
      'Invitation sent to n***@example.com. The person receives an 8 character code and chooses their own password.',
    );
    expect(result).toHaveTextContent(
      'Share this address only. The code arrives by email and is never shown here.',
    );
    expect(screen.getByTestId('accept-address')).toHaveTextContent(
      `${window.location.origin}/accept-invite`,
    );
  });

  it('says when the email could not be sent', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(apiUrl('/api/v1/admin/invites'), () =>
        HttpResponse.json({ ...fixtures.inviteSent, email_sent: false }, { status: 201 }),
      ),
    );
    await openInvites();
    await user.click(submit(await fillForm(user)));
    expect(
      await screen.findByText(
        'The invitation was created but the email could not be sent. Use Resend, or check email settings.',
      ),
    ).toBeInTheDocument();
  });

  it('copies only the accept invitation page address', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(() => Promise.resolve());
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue(/** @type {any} */ ({ writeText }));
    await openInvites();
    await user.click(submit(await fillForm(user)));
    await user.click(await screen.findByRole('button', { name: 'Copy address' }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/accept-invite`);
    expect(await screen.findByText('Address copied.')).toBeInTheDocument();
  });

  it('requires the email and a valid phone, and sends nothing until they are valid', async () => {
    const user = userEvent.setup();
    await openInvites();
    const dialog = await fillForm(user, { phone: '12345', email: '' });
    await user.click(submit(dialog));
    expect(await within(dialog).findByText('Enter your email address.')).toBeInTheDocument();
    expect(
      within(dialog).getByText('Enter a Kenyan mobile number, for example 0712 345 678.'),
    ).toBeInTheDocument();
    expect(recorder.of('POST', '/api/v1/admin/invites')).toEqual([]);
  });

  it.each([
    ['user_exists', 'An account with this phone number or email already exists.'],
    [
      'too_many_pending_invites',
      'There are too many open invitations. Revoke one before sending another.',
    ],
  ])('shows 409 %s in the form', async (code, message) => {
    const user = userEvent.setup();
    server.use(http.post(apiUrl('/api/v1/admin/invites'), () => errorResponse(409, code)));
    await openInvites();
    const dialog = await fillForm(user);
    await user.click(submit(dialog));
    expect(await within(dialog).findByText(message)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('puts a 422 on its field', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(apiUrl('/api/v1/admin/invites'), () =>
        validationErrorResponse([
          { field: 'email', message: 'This email domain is not accepted.' },
        ]),
      ),
    );
    await openInvites();
    const dialog = await fillForm(user);
    await user.click(submit(dialog));
    expect(
      await within(dialog).findAllByText('This email domain is not accepted.'),
    ).not.toHaveLength(0);
    expect(within(dialog).getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('counts down after a 429 with Retry-After', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(apiUrl('/api/v1/admin/invites'), () =>
        errorResponse(429, 'rate_limited', { headers: { 'Retry-After': '30' } }),
      ),
    );
    await openInvites();
    const dialog = await fillForm(user);
    await user.click(submit(dialog));
    expect(await within(dialog).findByRole('button', { name: 'Try again in 30 s' })).toBeDisabled();
  });

  it('sends one request on a double click', async () => {
    const user = userEvent.setup();
    await openInvites();
    const dialog = await fillForm(user);
    await user.dblClick(submit(dialog));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(recorder.of('POST', '/api/v1/admin/invites')).toHaveLength(1);
  });
});

describe('InvitesScreen: the list', () => {
  it('shows each status with an icon and the actions it allows', async () => {
    await openInvites();
    expect(rowOf(pending.id)).toHaveTextContent('Pending');
    expect(rowOf(pending.id)).toHaveTextContent('p***@example.com');
    expect(within(rowOf(pending.id)).getByRole('button', { name: /^Resend/ })).toBeInTheDocument();
    expect(
      within(rowOf(pending.id)).getByRole('button', { name: 'Revoke Pending Person' }),
    ).toBeInTheDocument();
    expect(rowOf(used.id)).toHaveTextContent('Used 19 Oct 2026, 11:00');
    expect(rowOf(revoked.id)).toHaveTextContent('Revoked 19 Oct 2026, 12:00');
    for (const invite of [used, expired, revoked]) {
      expect(within(rowOf(invite.id)).queryAllByRole('button')).toEqual([]);
    }
    expect(rowOf(locked.id)).toHaveTextContent(
      'Locked after too many wrong codes. Revoke it and send a new invitation.',
    );
    expect(within(rowOf(locked.id)).queryByRole('button', { name: /^Resend/ })).toBeNull();
    expect(
      within(rowOf(locked.id)).getByRole('button', { name: 'Revoke Locked Person' }),
    ).toBeInTheDocument();
    for (const row of [pending, used, expired, revoked, locked]) {
      expect(rowOf(row.id).querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it('maps the status chips to the status parameter', async () => {
    const user = userEvent.setup();
    await openInvites();
    await user.click(screen.getByRole('radio', { name: 'Locked' }));
    await waitFor(() =>
      expect(recorder.of('GET', '/api/v1/admin/invites').at(-1)?.query).toEqual({
        status: 'locked',
        limit: '20',
        offset: '0',
      }),
    );
  });

  it('resends and then waits 60 seconds before the next send', async () => {
    const user = userEvent.setup();
    await openInvites();
    await user.click(within(rowOf(pending.id)).getByRole('button', { name: /^Resend/ }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('A new code was sent to p***@example.com.'),
    );
    expect(
      await within(rowOf(pending.id)).findByRole('button', { name: /Try again in (59|60) s/ }),
    ).toBeDisabled();
    expect(recorder.of('POST', `/api/v1/admin/invites/${pending.id}/resend`)).toHaveLength(1);
  });

  it('counts down from Retry-After on 429 resend_cooldown', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(apiUrl('/api/v1/admin/invites/:id/resend'), () =>
        errorResponse(429, 'resend_cooldown', { headers: { 'Retry-After': '42' } }),
      ),
    );
    await openInvites();
    await user.click(within(rowOf(pending.id)).getByRole('button', { name: /^Resend/ }));
    expect(
      await within(rowOf(pending.id)).findByRole('button', { name: /Try again in (41|42) s/ }),
    ).toBeDisabled();
    expect(toast.error).toHaveBeenCalledWith('Wait 42 seconds before sending another code.');
  });

  it('explains send_limit_reached', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(apiUrl('/api/v1/admin/invites/:id/resend'), () =>
        errorResponse(409, 'send_limit_reached'),
      ),
    );
    await openInvites();
    await user.click(within(rowOf(pending.id)).getByRole('button', { name: /^Resend/ }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'No more codes can be sent for this invitation. Revoke it and send a new invitation.',
      ),
    );
  });

  it('revokes after a confirmation', async () => {
    const user = userEvent.setup();
    await openInvites();
    const button = within(rowOf(pending.id)).getByRole('button', { name: 'Revoke Pending Person' });
    await user.click(button);
    const dialog = screen.getByRole('dialog', {
      name: 'Revoke the invitation for Pending Person?',
    });
    await user.click(within(dialog).getByRole('button', { name: 'Revoke invitation' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Invitation revoked.'));
    expect(recorder.of('DELETE', `/api/v1/admin/invites/${pending.id}`)).toHaveLength(1);
    await waitFor(() => expect(button).toHaveFocus());
  });

  it('shows 409 invite_not_pending in the revoke dialog and refreshes', async () => {
    const user = userEvent.setup();
    server.use(
      http.delete(apiUrl('/api/v1/admin/invites/:id'), () =>
        errorResponse(409, 'invite_not_pending'),
      ),
    );
    await openInvites();
    await user.click(
      within(rowOf(pending.id)).getByRole('button', { name: 'Revoke Pending Person' }),
    );
    const before = recorder.of('GET', '/api/v1/admin/invites').length;
    await user.click(screen.getByRole('button', { name: 'Revoke invitation' }));
    expect(
      await screen.findByText('This invitation is no longer open. The list has been refreshed.'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(recorder.of('GET', '/api/v1/admin/invites').length).toBeGreaterThan(before),
    );
  });
});

describe('InvitesScreen: email check', () => {
  it('confirms a sent test email', async () => {
    const user = userEvent.setup();
    await openInvites();
    await user.click(screen.getByRole('button', { name: 'Check email delivery' }));
    expect(
      await screen.findByText('A test email was sent to your own address.'),
    ).toBeInTheDocument();
    expect(recorder.of('POST', '/api/v1/admin/email/test')).toHaveLength(1);
  });

  it.each(Object.entries(EMAIL_FAILURE_MESSAGES))(
    'explains a 502 email_failed with category %s',
    async (category, message) => {
      const user = userEvent.setup();
      server.use(
        http.post(apiUrl('/api/v1/admin/email/test'), () =>
          errorResponse(502, 'email_failed', { extra: { category } }),
        ),
      );
      await openInvites();
      await user.click(screen.getByRole('button', { name: 'Check email delivery' }));
      expect(await screen.findByTestId('email-check-result')).toHaveTextContent(message);
    },
  );
});

describe('InvitesScreen: never shows a code, password or token', () => {
  it('ignores a code in the list or the create response', async () => {
    const user = userEvent.setup();
    server.use(
      http.get(apiUrl('/api/v1/admin/invites'), () =>
        HttpResponse.json({
          ...fixtures.adminInvitesPage,
          items: fixtures.adminInvitesPage.items.map((i) => ({ ...i, code: SECRET_CODE })),
        }),
      ),
      http.post(apiUrl('/api/v1/admin/invites'), () =>
        HttpResponse.json({ ...fixtures.inviteSent, code: SECRET_CODE }, { status: 201 }),
      ),
    );
    const { container } = await openInvites();
    await user.click(submit(await fillForm(user)));
    await screen.findByTestId('invite-result');
    await act(async () => {});
    expect(document.body.innerHTML).not.toContain(SECRET_CODE);
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(
      document.body.querySelector('input[name="code"], input[autocomplete="one-time-code"]'),
    ).toBeNull();
  });
});
