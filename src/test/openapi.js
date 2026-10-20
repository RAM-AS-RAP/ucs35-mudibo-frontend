// Validates fixtures against the response schemas in docs/backend/openapi.json.
// Small $ref resolver: every compiled schema carries the document's components, so
// "#/components/schemas/X" resolves inside it. OpenAPI 3.1 schemas are JSON Schema 2020-12.
import Ajv2020 from 'ajv/dist/2020';
import openapi from '../../docs/backend/openapi.json';

const ajv = new Ajv2020({ strict: false, validateFormats: false, allErrors: true });

/**
 * @param {string} path
 * @param {string} method
 * @param {string} status
 */
export function getResponseSchema(path, method, status) {
  const operation = openapi.paths[path]?.[method];
  if (!operation) throw new Error(`No ${method.toUpperCase()} ${path} in openapi.json`);
  const schema = operation.responses?.[status]?.content?.['application/json']?.schema;
  if (!schema) throw new Error(`No JSON schema for ${status} on ${method.toUpperCase()} ${path}`);
  return schema;
}

/**
 * @param {{ path: string, method: string, status: string }} target
 * @param {unknown} data
 * @returns {{ valid: boolean, errors: string }}
 */
export function validateResponse({ path, method, status }, data) {
  const schema = { ...getResponseSchema(path, method, status), components: openapi.components };
  const validate = ajv.compile(schema);
  const valid = validate(data);
  return { valid: Boolean(valid), errors: ajv.errorsText(validate.errors) };
}

export { openapi };

/**
 * Validate data against one named schema of openapi.json (components.schemas[name]).
 * @param {string} name
 * @param {unknown} data
 * @returns {{ valid: boolean, errors: string }}
 */
export function validateComponent(name, data) {
  if (!openapi.components.schemas[name]) throw new Error(`No schema ${name} in openapi.json`);
  const schema = { $ref: `#/components/schemas/${name}`, components: openapi.components };
  const validate = ajv.compile(schema);
  const valid = validate(data);
  return { valid: Boolean(valid), errors: ajv.errorsText(validate.errors) };
}
