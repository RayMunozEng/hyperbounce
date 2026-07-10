export function resolveSupabaseConfig(win = typeof window === "undefined" ? null : window) {
    if (!win) return { url: "", anonKey: "" };

    return {
        url: String(win.HYPERBOUNCE_SUPABASE_URL || "").replace(/\/+$/, ""),
        anonKey: String(win.HYPERBOUNCE_SUPABASE_ANON_KEY || "")
    };
}

function resolveRedirectUrl(win) {
    return win && win.location && win.location.href ? String(win.location.href) : "";
}

function createMissingConfigError() {
    return new Error("Supabase auth is not configured");
}

function resolveAuthError(result) {
    return result && result.error ? result.error : null;
}

export class SupabaseAuthClient {
    constructor({
        url = "",
        anonKey = "",
        supabaseFactory = null,
        windowObj = typeof window === "undefined" ? null : window
    } = {}) {
        const config = url && anonKey ? { url, anonKey } : resolveSupabaseConfig(windowObj);

        this.url = String(config.url || "").replace(/\/+$/, "");
        this.anonKey = String(config.anonKey || "");
        this.windowObj = windowObj;
        this.supabaseFactory = supabaseFactory || (windowObj && windowObj.supabase) || null;
        this.client = this.createClient();
        this.session = null;
        this.sessionRevision = 0;
    }

    createClient() {
        if (!this.url || !this.anonKey || !this.supabaseFactory || !this.supabaseFactory.createClient) {
            return null;
        }

        return this.supabaseFactory.createClient(this.url, this.anonKey);
    }

    isConfigured() {
        return Boolean(this.client && this.client.auth);
    }

    requireClient() {
        if (!this.isConfigured()) return Promise.reject(createMissingConfigError());

        return Promise.resolve(this.client);
    }

    loadSession() {
        if (!this.isConfigured()) return Promise.resolve(null);
        const revisionAtRequest = this.sessionRevision;

        return this.client.auth.getSession()
            .then((result) => {
                const error = resolveAuthError(result);
                if (error) throw error;
                if (this.sessionRevision !== revisionAtRequest) return this.session;

                this.session = result && result.data ? result.data.session : null;
                this.sessionRevision += 1;
                return this.session;
            });
    }

    subscribe(handler) {
        if (!this.isConfigured() || !this.client.auth.onAuthStateChange) return null;

        return this.client.auth.onAuthStateChange((event, session) => {
            this.sessionRevision += 1;
            this.session = session || null;
            handler(event, this.session);
        });
    }

    signInWithGoogle() {
        return this.requireClient()
            .then((client) => client.auth.signInWithOAuth({
                provider: "google",
                options: {
                    redirectTo: resolveRedirectUrl(this.windowObj)
                }
            }))
            .then((result) => {
                const error = resolveAuthError(result);
                if (error) throw error;
                return result;
            });
    }

    sendMagicLink(email) {
        const cleanEmail = String(email || "").trim();

        if (!cleanEmail) return Promise.reject(new Error("Email is required"));

        return this.requireClient()
            .then((client) => client.auth.signInWithOtp({
                email: cleanEmail,
                options: {
                    emailRedirectTo: resolveRedirectUrl(this.windowObj)
                }
            }))
            .then((result) => {
                const error = resolveAuthError(result);
                if (error) throw error;
                return result;
            });
    }

    signOut() {
        return this.requireClient()
            .then((client) => client.auth.signOut({ scope: "local" }))
            .then((result) => {
                const error = resolveAuthError(result);
                if (error) throw error;
                this.sessionRevision += 1;
                this.session = null;
                return result;
            });
    }

    getAccessToken() {
        return this.session && this.session.access_token ? this.session.access_token : "";
    }

    getUserEmail() {
        return this.session && this.session.user && this.session.user.email ? this.session.user.email : "";
    }
}
