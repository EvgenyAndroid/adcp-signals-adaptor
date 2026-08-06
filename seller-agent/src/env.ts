export interface Env {
    ENVIRONMENT: string;
    PUBLISHER: string;
    AGENT_DOMAIN: string;
    /**
     * Bearer token gating every mutating MCP tool call. Provision with
     * `wrangler secret put ADCP_TEST_TOKEN` — never as a [vars] entry, which
     * would bake it into the public Worker bundle. Absent + no explicit
     * ALLOW_UNAUTHENTICATED opt-in makes the worker refuse to serve; see
     * auth.ts.
     */
    ADCP_TEST_TOKEN?: string;
    /**
     * Local-dev escape hatch. Only honoured when ENVIRONMENT is not
     * "production". Set to the literal string "true" to run without a token.
     */
    ALLOW_UNAUTHENTICATED?: string;
}
