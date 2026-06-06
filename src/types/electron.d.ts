export {};

declare global {
  interface Window {
    electron?: {
      readChromeCookies: (profilePath: string) => Promise<string>;
      listChromeProfiles: () => Promise<
        Array<{
          browserType: 'chrome' | 'edge' | 'brave';
          label: string;
          profilePath: string;
        }>
      >;
    };
  }
}
