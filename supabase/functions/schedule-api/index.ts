import { handleEdgeRequest } from '../_shared/edge-handler.js';

Deno.serve((request: Request) => {
    const env = {
        SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
        SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
        ADMIN_PASSWORD: Deno.env.get('ADMIN_PASSWORD'),
        SESSION_SECRET: Deno.env.get('SESSION_SECRET'),
        PROXY_SECRET: Deno.env.get('PROXY_SECRET'),
        ALLOWED_ORIGINS: Deno.env.get('ALLOWED_ORIGINS')
    };
    return handleEdgeRequest(request, env);
});
