(function startHyperbounce() {
    let bundleLoaded = false;

    function loadBundle() {
        if (bundleLoaded) return;

        bundleLoaded = true;
        const script = document.createElement("script");
        script.src = "bundle.js";
        document.body.appendChild(script);
    }

    const hasAuthConfig = Boolean(
        window.HYPERBOUNCE_SUPABASE_URL &&
        window.HYPERBOUNCE_SUPABASE_ANON_KEY
    );

    if (!hasAuthConfig) {
        loadBundle();
        return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    script.crossOrigin = "anonymous";
    script.onload = loadBundle;
    script.onerror = loadBundle;
    document.head.appendChild(script);
}());
