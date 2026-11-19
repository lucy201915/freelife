import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router";
import App from "./App";
import { BootstrapProvider, type BootstrapData } from "./lib/bootstrap";

export function render(url: string, bootstrap: BootstrapData = {}) {
  return renderToString(
    <BootstrapProvider value={bootstrap}>
      <StaticRouter location={url}>
        <App />
      </StaticRouter>
    </BootstrapProvider>,
  );
}

export type { BootstrapData };
export { getPublicServicePage, listPublicServices } from "./lib/supabase";
export { buildLlmsFullTxt, buildLlmsTxt, buildRobotsTxt, buildSitemapXml } from "./lib/seo-files";
export { PRIVATE_PATH_PREFIXES, SITE_ORIGIN, isPrivatePath } from "./lib/site";
