import { App, TFile, TFolder, normalizePath } from 'obsidian';
import { GenerationError, GenerationErrorClass } from '../types';

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
   * Embed image at the top of the note
   */
  async embedImageInNote(noteFile: TFile, imagePath: string): Promise<void> {
    try {
      const content = await this.app.vault.read(noteFile);

      // Create embed syntax
      const embedSyntax = `![[${imagePath}]]\n\n`;

      // Check if note has frontmatter
      const frontmatterMatch = content.match(/^---\n[\s\S]*?\n---\n/);

      let newContent: string;

      if (frontmatterMatch) {
        // Insert after frontmatter
        const frontmatter = frontmatterMatch[0];
        const restContent = content.slice(frontmatter.length);

        // Check if already has a poster embed (to replace it)
        const existingEmbed = restContent.match(/^!\[\[.*-poster-\d+\.(png|jpg|jpeg|webp)\]\]\n\n/);

        if (existingEmbed) {
          // Replace existing embed
          newContent = frontmatter + embedSyntax + restContent.slice(existingEmbed[0].length);
        } else {
          // Add new embed
          newContent = frontmatter + embedSyntax + restContent;
        }
      } else {
        // Check if already has a poster embed at the start
        const existingEmbed = content.match(/^!\[\[.*-poster-\d+\.(png|jpg|jpeg|webp)\]\]\n\n/);

        if (existingEmbed) {
          // Replace existing embed
          newContent = embedSyntax + content.slice(existingEmbed[0].length);
        } else {
          // Add at the beginning
          newContent = embedSyntax + content;
        }
      }

      await this.app.vault.modify(noteFile, newContent);
    } catch (error) {
      throw this.createError('SAVE_ERROR', `Failed to embed image: ${error instanceof Error ? error.message : String(error)}`);
    }
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
