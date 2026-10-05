import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_BUCKET = 'Onborading_docs';
const SIGNED_URL_SECONDS = 60 * 60;

export type StoredDocument = {
  url: string;
  storagePath: string | null;
  mimeType?: string | null;
  fileName?: string | null;
};

@Injectable()
export class StorageService {
  private client: SupabaseClient | null = null;
  private previewCache = new Map<string, { url: string; expiresAt: number }>();

  constructor(private config: ConfigService) {}

  bucket() {
    return this.config.get<string>('SUPABASE_STORAGE_BUCKET') || DEFAULT_BUCKET;
  }

  private supabase() {
    if (this.client) return this.client;
    const url = this.config.get<string>('SUPABASE_URL');
    const key = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) {
      throw new BadRequestException(
        'Supabase storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
      );
    }
    this.client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return this.client;
  }

  async upload(path: string, body: Buffer, contentType: string) {
    const { error } = await this.supabase().storage.from(this.bucket()).upload(path, body, {
      contentType,
      upsert: false,
    });
    if (error) {
      throw new BadRequestException(`Could not store file in ${this.bucket()}: ${error.message}`);
    }
    return path;
  }

  private cachedPreview(path: string) {
    const cached = this.previewCache.get(path);
    if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) return cached.url;
    return null;
  }

  private rememberPreview(path: string, url: string) {
    this.previewCache.set(path, {
      url,
      expiresAt: Date.now() + SIGNED_URL_SECONDS * 1000,
    });
  }

  async signedUrl(path: string) {
    const cached = this.cachedPreview(path);
    if (cached) return cached;

    const { data, error } = await this.supabase()
      .storage.from(this.bucket())
      .createSignedUrl(path, SIGNED_URL_SECONDS);
    if (error || !data?.signedUrl) {
      throw new BadRequestException(error?.message || 'Could not create a document preview link');
    }
    this.rememberPreview(path, data.signedUrl);
    return data.signedUrl;
  }

  async attachPreviewUrls<T extends StoredDocument>(docs: T[]) {
    const missing = [
      ...new Set(
        docs
          .map((doc) => doc.storagePath)
          .filter((path): path is string => !!path && !this.cachedPreview(path)),
      ),
    ];

    if (missing.length) {
      const { data, error } = await this.supabase()
        .storage.from(this.bucket())
        .createSignedUrls(missing, SIGNED_URL_SECONDS);
      if (!error && data) {
        data.forEach((item, index) => {
          if (!item.signedUrl) return;
          const path = missing[index];
          if (path) this.rememberPreview(path, item.signedUrl);
          if (item.path && item.path !== path) this.rememberPreview(item.path, item.signedUrl);
        });
      }
    }

    return docs.map((doc) => {
      if (!doc.storagePath) {
        const external = doc.url?.startsWith('http') ? doc.url : null;
        return { ...doc, previewUrl: external };
      }
      return { ...doc, previewUrl: this.cachedPreview(doc.storagePath) };
    });
  }
}
