// SPDX-License-Identifier: Apache-2.0

import { AdvisorError, isRecord } from "./errors";

/** OpenAI strict output requires every property to be required. Preserve optional
 * fields as a union of closed objects, rather than inventing nullable arguments.
 * Only server-owned, bounded schemas enter this adapter.
 */
export function strictSchema(schema: Record<string, unknown>): Record<string, unknown> {
  function visit(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(visit);
    if (!isRecord(value)) return value;
    const result = Object.fromEntries(Object.entries(value).map(([key, child]) => [key, visit(child)]));
    if (result.type !== "object" || !isRecord(result.properties)) return result;
    const properties = result.properties;
    const required = Array.isArray(result.required) ? result.required as string[] : [];
    const optional = Object.keys(properties).filter((name) => !required.includes(name));
    if (result.additionalProperties !== false || optional.length > 3 || required.some((name) => !Object.hasOwn(properties, name))) {
      throw new AdvisorError("provider_unavailable", "Strict output requires a bounded closed server schema.", 503);
    }
    if (!optional.length) return { ...result, required: Object.keys(properties) };
    const variants = Array.from({ length: 2 ** optional.length }, (_, mask) => {
      const keys = [...required, ...optional.filter((_, i) => mask & (1 << i))];
      return { ...result, properties: Object.fromEntries(keys.map((key) => [key, properties[key]])), required: keys };
    });
    return { anyOf: variants };
  }
  return visit(schema) as Record<string, unknown>;
}
