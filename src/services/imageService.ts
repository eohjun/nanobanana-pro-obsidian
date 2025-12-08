import { requestUrl } from 'obsidian';
import { ImageGenerationResult, GenerationError, ImageStyle, PreferredLanguage, IMAGE_STYLES, LANGUAGE_NAMES } from '../types';
import { IMAGE_GENERATION_PROMPT_TEMPLATE } from '../settingsData';

export class ImageService {
  /**
   * Generate an infographic image using Google Gemini
   */
  async generateImage(
    prompt: string,
    apiKey: string,
    model: string,
    style: ImageStyle,
    preferredLanguage: PreferredLanguage,
    imageSize: string = '4K',
    cartoonCuts: number = 4
  ): Promise<ImageGenerationResult> {
    if (!apiKey) {
      throw this.createError('INVALID_API_KEY', 'Google API key is not configured');
    }

    if (!prompt.trim()) {
      throw this.createError('NO_CONTENT', 'Prompt is empty');
    }

    try {
      // Language instruction mapping
      const languageInstructions: Record<PreferredLanguage, string> = {
        ko: 'IMPORTANT: All text in the image MUST be in Korean (한국어). Titles, labels, descriptions, and all content should be written in Korean.',
        en: 'IMPORTANT: All text in the image MUST be in English. Titles, labels, descriptions, and all content should be written in English.',
        ja: 'IMPORTANT: All text in the image MUST be in Japanese (日本語). Titles, labels, descriptions, and all content should be written in Japanese.',
        zh: 'IMPORTANT: All text in the image MUST be in Chinese (中文). Titles, labels, descriptions, and all content should be written in Chinese.',
        es: 'IMPORTANT: All text in the image MUST be in Spanish (Español). Titles, labels, descriptions, and all content should be written in Spanish.',
        fr: 'IMPORTANT: All text in the image MUST be in French (Français). Titles, labels, descriptions, and all content should be written in French.',
        de: 'IMPORTANT: All text in the image MUST be in German (Deutsch). Titles, labels, descriptions, and all content should be written in German.'
      };

      // Get style description, with special handling for cartoon style
      let styleDescription = IMAGE_STYLES[style];
      if (style === 'cartoon') {
        styleDescription = this.getCartoonStyleDescription(cartoonCuts);
      }

      // Format the prompt with style and language
      const fullPrompt = IMAGE_GENERATION_PROMPT_TEMPLATE
        .replace('{style}', styleDescription)
        .replace('{prompt}', prompt) + '\n\n' + languageInstructions[preferredLanguage];

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const response = await requestUrl({
        url,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: fullPrompt
            }]
          }],
          generationConfig: {
            responseModalities: ['TEXT', 'IMAGE'],
            imageConfig: {
              imageSize: imageSize
            }
          },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }
          ]
        })
      });

      if (response.status !== 200) {
        throw this.handleHttpError(response.status, response.text);
      }

      const data = response.json;

      // Extract image from response
      const imageData = this.extractImageFromResponse(data);

      if (!imageData) {
        throw this.createError('GENERATION_FAILED', 'No image was generated. Try a different prompt or style.');
      }

      return {
        imageData: imageData.data,
        mimeType: imageData.mimeType,
        model
      };
    } catch (error) {
      if ((error as GenerationError).type) {
        throw error;
      }
      throw this.handleApiError(error);
    }
  }

  /**
   * Extract base64 image data from Gemini API response
   */
  private extractImageFromResponse(data: any): { data: string; mimeType: string } | null {
    try {
      const candidates = data.candidates;
      if (!candidates || candidates.length === 0) {
        return null;
      }

      const content = candidates[0].content;
      if (!content || !content.parts) {
        return null;
      }

      // Look for inline_data (image) in parts
      for (const part of content.parts) {
        if (part.inline_data) {
          return {
            data: part.inline_data.data,
            mimeType: part.inline_data.mime_type || 'image/png'
          };
        }
      }

      // Check for image in different response format
      if (content.parts[0]?.inlineData) {
        return {
          data: content.parts[0].inlineData.data,
          mimeType: content.parts[0].inlineData.mimeType || 'image/png'
        };
      }

      return null;
    } catch (e) {
      console.error('Error extracting image from response:', e);
      return null;
    }
  }

  private handleHttpError(status: number, responseText: string): GenerationError {
    if (status === 401 || status === 403) {
      return this.createError('INVALID_API_KEY', 'Invalid Google API key');
    }
    if (status === 429) {
      return this.createError('RATE_LIMIT', 'API rate limit exceeded. Please wait and try again.', true);
    }
    if (status === 400) {
      // Check for content filtering
      if (responseText.includes('SAFETY') || responseText.includes('blocked')) {
        return this.createError('CONTENT_FILTERED', 'Content was blocked by safety filters. Try modifying your prompt.');
      }
      return this.createError('GENERATION_FAILED', `Bad request: ${responseText}`);
    }
    if (status >= 500) {
      return this.createError('NETWORK_ERROR', 'Server error. Please try again later.', true);
    }
    return this.createError('GENERATION_FAILED', `API error (${status}): ${responseText}`);
  }

  private handleApiError(error: unknown): GenerationError {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('net::') || errorMessage.includes('network')) {
      return this.createError('NETWORK_ERROR', 'Network connection error. Check your internet connection.', true);
    }

    return this.createError('GENERATION_FAILED', `Image generation error: ${errorMessage}`);
  }

  private createError(type: GenerationError['type'], message: string, retryable = false): GenerationError {
    return { type, message, retryable };
  }

  /**
   * Generate cartoon style description based on number of cuts
   */
  private getCartoonStyleDescription(cuts: number): string {
    const layoutDescriptions: Record<number, string> = {
      4: '2x2 grid layout (2 rows, 2 columns)',
      6: '2x3 grid layout (2 rows, 3 columns) or 3x2 grid layout',
      8: '2x4 grid layout (2 rows, 4 columns) or 4x2 grid layout'
    };

    const layout = layoutDescriptions[cuts] || `${cuts} sequential panels in a balanced grid`;

    return `Comic strip / manga style illustration with exactly ${cuts} sequential panels arranged in a ${layout}.
Each panel should:
- Tell part of the story in clear visual sequence from panel 1 to panel ${cuts}
- Feature expressive characters with consistent design across all panels
- Include speech bubbles or thought bubbles where appropriate
- Use bold black outlines and vibrant colors
- Show dynamic compositions and varied camera angles
- Have clear panel borders with small gaps between panels
- Progress the narrative logically from beginning to end

The overall style should be:
- Modern comic/manga aesthetic with clean linework
- High contrast colors for visual impact
- Professional quality suitable for educational content
- Easy to follow visual storytelling`;
  }
}
