/**
 * Builds a query string for multiple state parameters
 * Converts ['ASIGNADO', 'EN_CURSO'] into 'state=ASIGNADO&state=EN_CURSO'
 */
export const buildStateQuery = (states: string[]): string => {
  return states.map((s) => `state=${encodeURIComponent(s)}`).join("&");
};

/**
 * Builds a query string for any parameter with multiple values
 * Generic version of buildStateQuery
 */
export const buildMultiQuery = (param: string, values: string[]): string => {
  return values.map((v) => `${param}=${encodeURIComponent(v)}`).join("&");
};