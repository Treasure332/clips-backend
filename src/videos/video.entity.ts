export type VideoStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface Video {
  id: string;
  userId: string;
  status: VideoStatus;
  /** Set when clip-generation exhausts all retry attempts */
  processingError: string | null;
  createdAt: Date;
  updatedAt: Date;
}
