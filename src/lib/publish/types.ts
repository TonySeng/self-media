export type PublishInput = {
  videoPath: string;
  title: string;
  description?: string;
  coverPath?: string;
  cookie: string;
};

export type PublishResult = {
  success: boolean;
  screenshotPath?: string;
  error?: string;
};
