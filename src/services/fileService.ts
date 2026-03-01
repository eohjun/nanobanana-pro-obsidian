import { App, TFile, TFolder, normalizePath } from 'obsidian';
import { GenerationError, GenerationErrorClass, DriveUploadResult } from '../types';

export class FileService {
  constructor(private app: App) {}

  /**
   * Save image to the vault and return the path
   */
  async saveImage(
    imageData: string,
    mimeType: string,
    noteFile: TFile,
    attachmentFolder: string
  ): Promise<string> {
    try {
      // Determine file extension from mime type
      const extension = this.getExtensionFromMimeType(mimeType);

      // Generate unique filename
      const timestamp = Date.now();
      const baseName = noteFile.basename.replace(/[^a-zA-Z0-9가-힣]/g, '-');
      const fileName = `${baseName}-poster-${timestamp}.${extension}`;

      // Ensure attachment folder exists
      await this.ensureFolderExists(attachmentFolder);

      // Full path for the image
      const imagePath = normalizePath(`${attachmentFolder}/${fileName}`);

      // Convert base64 to binary
      const binaryData = this.base64ToArrayBuffer(imageData);

      // Save file
      await this.app.vault.createBinary(imagePath, binaryData);

      return imagePath;
    } catch (error) {
      throw this.createError('SAVE_ERROR', `Failed to save image: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Embed image at the top of the note.
   * If driveResult is provided, uses HTML <img> embedding for Drive images.
   * Otherwise uses standard ![[path]] embedding.
   */
  async embedImageInNote(noteFile: TFile, imagePath: string, driveResult?: DriveUploadResult): Promise<void> {
    try {
      const content = await this.app.vault.read(noteFile);

      // Build embed syntax based on storage mode
      let embedSyntax: string;
      if (driveResult) {
        embedSyntax = this.buildDriveEmbed(driveResult) + '\n\n';
      } else {
        embedSyntax = `![[${imagePath}]]\n\n`;
      }

      // Check if note has frontmatter
      const frontmatterMatch = content.match(/^---\n[\s\S]*?\n---\n/);

      let newContent: string;

      if (frontmatterMatch) {
        const frontmatter = frontmatterMatch[0];
        const restContent = content.slice(frontmatter.length);
        const existing = this.findExistingPosterEmbed(restContent);

        if (existing !== null) {
          newContent = frontmatter + embedSyntax + restContent.slice(existing);
        } else {
          newContent = frontmatter + embedSyntax + restContent;
        }
      } else {
        const existing = this.findExistingPosterEmbed(content);

        if (existing !== null) {
          newContent = embedSyntax + content.slice(existing);
        } else {
          newContent = embedSyntax + content;
        }
      }

      await this.app.vault.modify(noteFile, newContent);
    } catch (error) {
      throw this.createError('SAVE_ERROR', `Failed to embed image: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Build Drive HTML embed for an uploaded image
   */
  private buildDriveEmbed(result: DriveUploadResult): string {
    return `<div class="nanobanana-poster" style="width: 100%; margin: 0 auto; text-align: center;">
<a href="${result.webViewLink}" target="_blank">
<img src="https://drive.google.com/thumbnail?id=${result.fileId}&sz=w1000" alt="${result.fileName}" style="max-width: 100%; height: auto; object-fit: contain; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); cursor: pointer;"/>
</a>
</div>`;
  }

  /**
   * Find existing poster embed at the start of content.
   * Supports both local (![[...-poster-TIMESTAMP.ext]]) and Drive (<div class="nanobanana-poster">) formats.
   * Returns the length of the matched embed string (including trailing newlines) or null.
   */
  private findExistingPosterEmbed(content: string): number | null {
    // Local embed: ![[...-poster-TIMESTAMP.ext]]\n\n
    const localMatch = content.match(/^!\[\[.*-poster-\d+\.(png|jpg|jpeg|webp)\]\]\n\n/);
    if (localMatch) return localMatch[0].length;

    // Drive embed: <div class="nanobanana-poster">...</div>\n\n
    const driveMatch = content.match(/^<div class="nanobanana-poster"[\s\S]*?<\/div>\n\n/);
    if (driveMatch) return driveMatch[0].length;

    return null;
  }

  /**
   * Ensure a folder exists, creating it if necessary
   * Cross-platform safe: handles Git sync scenarios where folder exists but index hasn't updated
   */
  private async ensureFolderExists(folderPath: string): Promise<void> {
    const normalizedPath = normalizePath(folderPath);
    const existing = this.app.vault.getAbstractFileByPath(normalizedPath);

    // Already exists as folder in index
    if (existing instanceof TFolder) {
      return;
    }

    // Exists as file - error
    if (existing instanceof TFile) {
      throw this.createError('SAVE_ERROR', `${folderPath} exists but is not a folder`);
    }

    // Not in index - try to create (may already exist from Git sync)
    try {
      await this.app.vault.createFolder(normalizedPath);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // "Folder already exists" is OK (Git sync scenario on iOS/Android)
      if (msg.toLowerCase().includes('already exists')) {
        console.log(`[NanoBanana] Folder already exists (sync OK): ${normalizedPath}`);
        return;
      }
      throw this.createError('SAVE_ERROR', `Failed to create folder: ${msg}`);
    }
  }

  /**
   * Convert base64 string to ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Get file extension from MIME type
   */
  private getExtensionFromMimeType(mimeType: string): string {
    const mimeMap: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/webp': 'webp',
      'image/gif': 'gif'
    };
    return mimeMap[mimeType] || 'png';
  }

  private createError(type: GenerationError['type'], message: string): GenerationErrorClass {
    return new GenerationErrorClass(type, message, false);
  }
}
