import { defineConfig } from "@apps-in-toss/web-framework/config";

export default defineConfig({
  // 앱인토스 콘솔에 등록된 앱 이름(고유 ID)과 대소문자까지 똑같아야 업로드돼요.
  appName: "atelier-zen",
  brand: {
    primaryColor: "#047857",
  },
  permissions: [],
  navigationBar: {
    withBackButton: true,
    withHomeButton: false,
    theme: "light",
  },
  webView: {
    bounces: false,
    pullToRefreshEnabled: false,
    overScrollMode: "never",
  },
  webBundleDir: "dist",
});
