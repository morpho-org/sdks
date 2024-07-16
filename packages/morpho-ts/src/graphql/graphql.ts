export type GraphQLRes<T> = { data: T } | { errors: any };

const onResponse = async (url: string, response: Response) => {
  if (response.ok) return await response.json();
  const code = response.status;
  const message = await response.text();
  throw new Error(`[${url}:${code}] ${message}`);
};

export const graphql = async <T = any>(endpoint: string, query: any, variables?: any) => {
  const body: { query: string; variables?: any } = { query };
  if (variables) body.variables = variables;

  const headers: Headers = new Headers({ "Content-Type": "application/json" });

  const response: GraphQLRes<T> = await fetch(endpoint, {
    method: "POST",
    body: JSON.stringify(body),
    headers,
  }).then((r) => onResponse(endpoint, r));

  if ("data" in response) return response.data;
  throw new Error(response.errors.map((e: any) => e.message));
};
