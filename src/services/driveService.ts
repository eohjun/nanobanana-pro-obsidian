/**
 * Google Drive Service - OAuth + Upload in a single class
 * Adapted from obsidian-embedder's google-oauth-flow.ts + uploader.ts
 */
import { Notice, requestUrl, Platform } from 'obsidian';
import { shell } from 'electron';
import * as http from 'http';
import * as url from 'url';
import { NanoBananaSettings, OAuthTokens, DriveUploadResult, GenerationErrorClass } from '../types';

export interface DriveServiceConfig {
  settings: NanoBananaSettings;
  onSettingsChange: () => Promise<void>;
}

export class DriveService {
  private readonly AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
  private readonly TOKEN_URL = 'https://oauth2.googleapis.com/token';
  private readonly API_URL = 'https://www.googleapis.com/drive/v3';
  private readonly UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3';
  private readonly SCOPES = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/userinfo.email'
  ];
  private readonly REQUEST_TIMEOUT_MS = 15000;

  private settings: NanoBananaSettings;
  private onSettingsChange: () => Promise<void>;
  private server: http.Server | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private folderIdCache = new Map<string, string>();

  constructor(config: DriveServiceConfig) {
    this.settings = config.settings;
    this.onSettingsChange = config.onSettingsChange;
  }

  // ─── OAuth ─────────────────────────────────────────────

  async authorize(): Promise<OAuthTokens> {
    if (!Platform.isDesktop) {
      throw new GenerationErrorClass(
        'DRIVE_UPLOAD_ERROR',
        'Google Drive authorization requires the desktop app. Please authorize on desktop first.',
        false
      );
    }

    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);
    const redirectUri = `http://localhost:${this.settings.oauthRedirectPort}/callback`;

    return new Promise((resolve, reject) => {
      try {
        this.server = http.createServer(async (req, res) => {
          try {
            const parsedUrl = url.parse(req.url || '', true);

            if (parsedUrl.pathname === '/callback') {
              const code = parsedUrl.query.code as string;
              const error = parsedUrl.query.error as string;

              if (error) {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(this.getErrorHtml(error));
                this.cleanup();
                reject(new GenerationErrorClass('DRIVE_UPLOAD_ERROR', `OAuth error: ${error}`, false));
                return;
              }

              if (code) {
                try {
                  const tokens = await this.exchangeCodeForTokens(code, codeVerifier, redirectUri);
                  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                  res.end(this.getSuccessHtml());
                  this.cleanup();
                  resolve(tokens);
                } catch (tokenError) {
                  const errorMessage = tokenError instanceof Error ? tokenError.message : String(tokenError);
                  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                  res.end(this.getErrorHtml(errorMessage));
                  this.cleanup();
                  reject(new GenerationErrorClass('DRIVE_UPLOAD_ERROR', `Token exchange failed: ${errorMessage}`, false));
                }
              }
            }
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        });

        this.server.listen(this.settings.oauthRedirectPort, () => {
          console.debug(`[NanoBanana] OAuth callback server listening on port ${this.settings.oauthRedirectPort}`);
        });

        this.server.on('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'EADDRINUSE') {
            reject(new GenerationErrorClass(
              'DRIVE_UPLOAD_ERROR',
              `Port ${this.settings.oauthRedirectPort} is already in use. Change the OAuth redirect port in settings.`,
              false
            ));
          } else {
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        });

        const authUrl = this.buildAuthUrl(redirectUri, codeChallenge);
        new Notice('Please log in with Google in your browser...', 3000);
        void shell.openExternal(authUrl);

        this.timeoutId = setTimeout(() => {
          if (this.server) {
            this.cleanup();
            reject(new GenerationErrorClass('DRIVE_UPLOAD_ERROR', 'OAuth flow timed out. Please try again.', true));
          }
        }, 120000);
      } catch (error) {
        this.cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  isConnected(): boolean {
    return !!(this.settings.googleAccessToken && this.settings.googleRefreshToken);
  }

  disconnect(): void {
    this.settings.googleAccessToken = '';
    this.settings.googleRefreshToken = '';
    this.settings.tokenExpiresAt = 0;
    this.folderIdCache.clear();
  }

  // ─── Upload ────────────────────────────────────────────

  async uploadImage(imageData: string, mimeType: string, fileName: string): Promise<DriveUploadResult> {
    const accessToken = await this.ensureValidToken();
    const folderId = await this.ensureFolder(this.settings.driveFolder);

    const metadata = {
      name: fileName,
      mimeType: mimeType,
      parents: [folderId]
    };

    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const multipartBody =
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      `Content-Type: ${mimeType}\r\n` +
      'Content-Transfer-Encoding: base64\r\n\r\n' +
      imageData +
      closeDelimiter;

    const uploadResponse = await this.withTimeout(requestUrl({
      url: `${this.UPLOAD_URL}/files?uploadType=multipart&fields=id,name,mimeType`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipartBody
    }), 60000);

    if (uploadResponse.status !== 200) {
      throw new GenerationErrorClass('DRIVE_UPLOAD_ERROR', `Drive upload failed: ${uploadResponse.status}`, true);
    }

    const fileData = uploadResponse.json;
    if (!fileData || typeof fileData.id !== 'string') {
      throw new GenerationErrorClass('DRIVE_UPLOAD_ERROR', 'Upload response missing file ID', false);
    }

    const fileId = fileData.id;

    await this.makeFilePublic(fileId);
    const fileInfo = await this.getFileInfo(fileId);

    return {
      fileId,
      webViewLink: fileInfo.webViewLink || `https://drive.google.com/file/d/${fileId}/view`,
      webContentLink: fileInfo.webContentLink || `https://drive.google.com/uc?export=view&id=${fileId}`,
      fileName,
      mimeType
    };
  }

  async testConnection(): Promise<{ connected: boolean; email?: string }> {
    try {
      const accessToken = await this.ensureValidToken();

      const response = await this.withTimeout(requestUrl({
        url: `${this.API_URL}/about?fields=user`,
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }));

      if (response.status === 200) {
        const data = response.json;
        return { connected: true, email: data.user?.emailAddress };
      }
      return { connected: false };
    } catch {
      return { connected: false };
    }
  }

  // ─── Token Management ──────────────────────────────────

  private async ensureValidToken(): Promise<string> {
    if (this.settings.tokenExpiresAt && this.settings.googleRefreshToken) {
      if (this.isTokenExpired(this.settings.tokenExpiresAt)) {
        console.debug('[NanoBanana] Access token expired, refreshing...');
        try {
          const newTokens = await this.refreshAccessToken(this.settings.googleRefreshToken);
          this.settings.googleAccessToken = newTokens.accessToken;
          this.settings.tokenExpiresAt = newTokens.expiresAt;
          await this.onSettingsChange();
          new Notice('Google Drive token automatically refreshed');
        } catch {
          throw new GenerationErrorClass(
            'DRIVE_UPLOAD_ERROR',
            'Token refresh failed. Please reconnect Google Drive in settings.',
            false
          );
        }
      }
    }

    if (!this.settings.googleAccessToken) {
      throw new GenerationErrorClass(
        'DRIVE_UPLOAD_ERROR',
        'Not connected to Google Drive. Please connect in settings.',
        false
      );
    }

    return this.settings.googleAccessToken;
  }

  private isTokenExpired(expiresAt: number): boolean {
    const bufferTime = 5 * 60 * 1000;
    return Date.now() >= (expiresAt - bufferTime);
  }

  private async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
    const response = await requestUrl({
      url: this.TOKEN_URL,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.settings.googleClientId,
        client_secret: this.settings.googleClientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      }).toString()
    });

    if (response.status !== 200) {
      throw new Error(`Token refresh failed: ${response.status}`);
    }

    const data = response.json;
    const expiresAt = Date.now() + (data.expires_in * 1000);

    return {
      accessToken: data.access_token,
      refreshToken: refreshToken,
      expiresIn: data.expires_in,
      expiresAt
    };
  }

  private async exchangeCodeForTokens(
    code: string,
    codeVerifier: string,
    redirectUri: string
  ): Promise<OAuthTokens> {
    let response;
    try {
      response = await requestUrl({
        url: this.TOKEN_URL,
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: this.settings.googleClientId,
          client_secret: this.settings.googleClientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: codeVerifier
        }).toString(),
        throw: false
      });
    } catch (error) {
      console.error('[NanoBanana] Token exchange request failed:', error);
      throw new Error(`Token exchange request failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (response.status !== 200) {
      const errorBody = response.json ?? response.text;
      console.error('[NanoBanana] Token exchange failed:', response.status, errorBody);
      const errorDesc = response.json?.error_description || response.json?.error || `status ${response.status}`;
      throw new Error(`Token exchange failed: ${errorDesc}`);
    }

    const data = response.json;
    const expiresAt = Date.now() + (data.expires_in * 1000);

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      expiresAt
    };
  }

  // ─── Drive Folder Management ───────────────────────────

  private async ensureFolder(folderPath: string): Promise<string> {
    const parts = folderPath.split('/').filter(p => p.length > 0);
    let parentId = 'root';
    let cumulativePath = '';

    for (const folderName of parts) {
      cumulativePath += '/' + folderName;

      const cached = this.folderIdCache.get(cumulativePath);
      if (cached) {
        parentId = cached;
        continue;
      }

      const existingId = await this.findFolder(folderName, parentId);
      if (existingId) {
        parentId = existingId;
      } else {
        parentId = await this.createFolder(folderName, parentId);
      }

      this.folderIdCache.set(cumulativePath, parentId);
    }

    return parentId;
  }

  private async findFolder(name: string, parentId: string): Promise<string | null> {
    try {
      const accessToken = await this.ensureValidToken();
      const escapedName = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const query = `name='${escapedName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;

      const response = await this.withTimeout(requestUrl({
        url: `${this.API_URL}/files?q=${encodeURIComponent(query)}&fields=files(id)`,
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }));

      if (response.status === 200) {
        const data = response.json;
        if (data.files && Array.isArray(data.files) && data.files.length > 0 && data.files[0].id) {
          return data.files[0].id;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  private async createFolder(name: string, parentId: string): Promise<string> {
    const accessToken = await this.ensureValidToken();

    const response = await this.withTimeout(requestUrl({
      url: `${this.API_URL}/files`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId]
      })
    }));

    if (response.status !== 200) {
      throw new GenerationErrorClass('DRIVE_UPLOAD_ERROR', `Folder creation failed: ${response.status}`, true);
    }

    return response.json.id;
  }

  private async makeFilePublic(fileId: string): Promise<void> {
    try {
      const accessToken = await this.ensureValidToken();

      await this.withTimeout(requestUrl({
        url: `${this.API_URL}/files/${fileId}/permissions`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ role: 'reader', type: 'anyone' })
      }));
    } catch (error) {
      console.error('[NanoBanana] Failed to make file public:', error);
    }
  }

  private async getFileInfo(fileId: string): Promise<{ webViewLink?: string; webContentLink?: string }> {
    try {
      const accessToken = await this.ensureValidToken();

      const response = await this.withTimeout(requestUrl({
        url: `${this.API_URL}/files/${fileId}?fields=webViewLink,webContentLink`,
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }));

      return response.json as { webViewLink?: string; webContentLink?: string };
    } catch {
      return {};
    }
  }

  // ─── OAuth URL / PKCE Helpers ──────────────────────────

  private buildAuthUrl(redirectUri: string, codeChallenge: string): string {
    const params = new URLSearchParams({
      client_id: this.settings.googleClientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: this.SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });
    return `${this.AUTH_URL}?${params.toString()}`;
  }

  private generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return this.base64UrlEncode(array);
  }

  private async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return this.base64UrlEncode(new Uint8Array(hash));
  }

  private base64UrlEncode(buffer: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < buffer.length; i++) {
      binary += String.fromCharCode(buffer[i]);
    }
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  // ─── Utilities ─────────────────────────────────────────

  private async withTimeout<T>(promise: Promise<T>, ms?: number): Promise<T> {
    const timeout = ms ?? this.REQUEST_TIMEOUT_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Request timed out after ${timeout}ms`)), timeout);
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private cleanup(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  private getSuccessHtml(): string {
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>NanoBanana - Google Drive Connected</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:linear-gradient(135deg,#4285f4 0%,#34a853 100%)}
.container{background:#fff;padding:40px 60px;border-radius:16px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.2)}
.icon{font-size:64px;margin-bottom:20px}h1{color:#333;margin-bottom:10px}p{color:#666;margin-bottom:20px}.hint{font-size:14px;color:#999}
</style></head><body><div class="container">
<div class="icon">✅</div><h1>Connection complete!</h1>
<p>Google Drive has been connected to NanoBanana PRO.</p>
<p class="hint">You can close this window and return to Obsidian.</p>
</div></body></html>`;
  }

  private getErrorHtml(error: string): string {
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>NanoBanana - Connection Failed</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:linear-gradient(135deg,#ea4335 0%,#fbbc05 100%)}
.container{background:#fff;padding:40px 60px;border-radius:16px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.2)}
.icon{font-size:64px;margin-bottom:20px}h1{color:#333;margin-bottom:10px}p{color:#666;margin-bottom:20px}
.detail{background:#fff3f3;border:1px solid #fcc;padding:10px 20px;border-radius:8px;color:#c00;font-family:monospace}
</style></head><body><div class="container">
<div class="icon">❌</div><h1>Connection failed</h1>
<p>Failed to connect to Google Drive.</p>
<div class="detail">${error}</div>
<p>Please try again in Obsidian.</p>
</div></body></html>`;
  }
}
