import InsightsScript from "next/script";
import type { AppProps } from "next/app";

export default function App({ Component, pageProps }: AppProps) {
  return <><Component {...pageProps} /><InsightsScript src="https://insights.bittrees.org/consent.js" data-insights-site="nftfactory" strategy="afterInteractive" /></>;
}
