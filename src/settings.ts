import { App, PluginSettingTab, Setting, Notice, requestUrl } from 'obsidian';
import NanoBananaPlugin from './main';
import { AIProvider, ImageStyle, ImageSize, PreferredLanguage, CartoonCuts, PROVIDER_CONFIGS } from './types';

export class NanoBananaSettingTab extends PluginSettingTab {
  plugin: NanoBananaPlugin;

  constructor(app: App, plugin: NanoBananaPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // ==================== API Keys Section ====================
    new Setting(containerEl).setName('API keys').setHeading();

    new Setting(containerEl)
      .setName('Google API key')
      .setDesc('Required for image generation. Get your key from Google AI Studio.')
      .addText(text => text
        .setPlaceholder('Enter your Google API key')
        .setValue(this.plugin.settings.googleApiKey)
        .onChange(async (value) => {
          this.plugin.settings.googleApiKey = value;
          await this.plugin.saveSettings();
        })
      )
      .addExtraButton(button => button
        .setIcon('external-link')
        .setTooltip('Get API key')
        .onClick(() => {
          window.open('https://aistudio.google.com/apikey');
        })
      )
      .addExtraButton(button => button
        .setIcon('checkmark')
        .setTooltip('Test API key')
        .onClick(async () => {
          if (!this.plugin.settings.googleApiKey) {
            new Notice('Please enter an API key first');
            return;
          }
          new Notice('Testing API key...');
          try {
            const response = await requestUrl({
              url: `https://generativelanguage.googleapis.com/v1beta/models?key=${this.plugin.settings.googleApiKey}`,
              method: 'GET'
            });
            if (response.status === 200) {
              new Notice('Google API key is valid!');
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes('400') || msg.includes('403') || msg.includes('401')) {
              new Notice('Invalid API key. Please check and try again.');
            } else {
              new Notice(`Connection error: ${msg}`);
            }
          }
        })
      );

    new Setting(containerEl)
      .setName('OpenAI API key')
      .setDesc('Optional. Used for prompt generation if OpenAI is selected.')
      .addText(text => text
        .setPlaceholder('Enter your OpenAI API key')
        .setValue(this.plugin.settings.openaiApiKey)
        .onChange(async (value) => {
          this.plugin.settings.openaiApiKey = value;
          await this.plugin.saveSettings();
        })
      )
      .addExtraButton(button => button
        .setIcon('external-link')
        .setTooltip('Get API key')
        .onClick(() => {
          window.open('https://platform.openai.com/api-keys');
        })
      )
      .addExtraButton(button => button
        .setIcon('checkmark')
        .setTooltip('Test API key')
        .onClick(async () => {
          if (!this.plugin.settings.openaiApiKey) {
            new Notice('Please enter an API key first');
            return;
          }
          new Notice('Testing API key...');
          try {
            const response = await requestUrl({
              url: 'https://api.openai.com/v1/models',
              method: 'GET',
              headers: { 'Authorization': `Bearer ${this.plugin.settings.openaiApiKey}` }
            });
            if (response.status === 200) {
              new Notice('OpenAI API key is valid!');
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes('400') || msg.includes('403') || msg.includes('401')) {
              new Notice('Invalid API key. Please check and try again.');
            } else {
              new Notice(`Connection error: ${msg}`);
            }
          }
        })
      );

    new Setting(containerEl)
      .setName('Anthropic API key')
      .setDesc('Optional. Used for prompt generation if Anthropic is selected.')
      .addText(text => text
        .setPlaceholder('Enter your Anthropic API key')
        .setValue(this.plugin.settings.anthropicApiKey)
        .onChange(async (value) => {
          this.plugin.settings.anthropicApiKey = value;
          await this.plugin.saveSettings();
        })
      )
      .addExtraButton(button => button
        .setIcon('external-link')
        .setTooltip('Get API key')
        .onClick(() => {
          window.open('https://console.anthropic.com/settings/keys');
        })
      )
      .addExtraButton(button => button
        .setIcon('checkmark')
        .setTooltip('Test API key')
        .onClick(async () => {
          if (!this.plugin.settings.anthropicApiKey) {
            new Notice('Please enter an API key first');
            return;
          }
          new Notice('Testing API key...');
          try {
            await requestUrl({
              url: 'https://api.anthropic.com/v1/messages',
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.plugin.settings.anthropicApiKey,
                'anthropic-version': '2023-06-01'
              },
              body: JSON.stringify({
                model: 'claude-sonnet-4-5-20250929',
                max_tokens: 1,
                messages: [{ role: 'user', content: 'Hi' }]
              })
            });
            new Notice('Anthropic API key is valid!');
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes('401') || msg.includes('403')) {
              new Notice('Invalid API key. Please check and try again.');
            } else if (msg.includes('400') || msg.includes('200') || msg.includes('529')) {
              // 400 can mean invalid model but key is valid; 529 = overloaded but key works
              new Notice('Anthropic API key is valid!');
            } else {
              new Notice(`Connection error: ${msg}`);
            }
          }
        })
      );

    new Setting(containerEl)
      .setName('xAI API key')
      .setDesc('Optional. Used for prompt generation if xAI is selected.')
      .addText(text => text
        .setPlaceholder('Enter your xAI API key')
        .setValue(this.plugin.settings.xaiApiKey)
        .onChange(async (value) => {
          this.plugin.settings.xaiApiKey = value;
          await this.plugin.saveSettings();
        })
      )
      .addExtraButton(button => button
        .setIcon('external-link')
        .setTooltip('Get API key')
        .onClick(() => {
          window.open('https://console.x.ai/');
        })
      )
      .addExtraButton(button => button
        .setIcon('checkmark')
        .setTooltip('Test API key')
        .onClick(async () => {
          if (!this.plugin.settings.xaiApiKey) {
            new Notice('Please enter an API key first');
            return;
          }
          new Notice('Testing API key...');
          try {
            const response = await requestUrl({
              url: 'https://api.x.ai/v1/models',
              method: 'GET',
              headers: { 'Authorization': `Bearer ${this.plugin.settings.xaiApiKey}` }
            });
            if (response.status === 200) {
              new Notice('xAI API key is valid!');
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes('400') || msg.includes('403') || msg.includes('401')) {
              new Notice('Invalid API key. Please check and try again.');
            } else {
              new Notice(`Connection error: ${msg}`);
            }
          }
        })
      );

    // ==================== Prompt Generation Section ====================
    new Setting(containerEl).setName('Prompt generation').setHeading();

    new Setting(containerEl)
      .setName('AI provider')
      .setDesc('Select which AI provider to use for generating image prompts.')
      .addDropdown(dropdown => dropdown
        .addOptions({
          'google': 'Google Gemini',
          'openai': 'OpenAI',
          'anthropic': 'Anthropic',
          'xai': 'xAI (Grok)'
        })
        .setValue(this.plugin.settings.selectedProvider)
        .onChange(async (value: AIProvider) => {
          this.plugin.settings.selectedProvider = value;
          // Set default model for selected provider
          this.plugin.settings.promptModel = PROVIDER_CONFIGS[value].defaultModel;
          await this.plugin.saveSettings();
          this.display(); // Refresh to update model suggestions
        })
      );

    const providerConfig = PROVIDER_CONFIGS[this.plugin.settings.selectedProvider];
    new Setting(containerEl)
      .setName('Prompt model')
      .setDesc(`Model to use for prompt generation. Suggestions: ${providerConfig.models.join(', ')}`)
      .addText(text => text
        .setPlaceholder(providerConfig.defaultModel)
        .setValue(this.plugin.settings.promptModel)
        .onChange(async (value) => {
          this.plugin.settings.promptModel = value;
          await this.plugin.saveSettings();
        })
      );

    // ==================== Image Generation Section ====================
    new Setting(containerEl).setName('Image generation').setHeading();

    new Setting(containerEl)
      .setName('Image model')
      .setDesc('Google Gemini model for image generation. Must support image output.')
      .addText(text => text
        .setPlaceholder('gemini-3-pro-image-preview')
        .setValue(this.plugin.settings.imageModel)
        .onChange(async (value) => {
          this.plugin.settings.imageModel = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Image style')
      .setDesc('Default style for generated posters.')
      .addDropdown(dropdown => dropdown
        .addOptions({
          'infographic': '📊 Infographic - charts, icons, visual hierarchy',
          'poster': '🎨 Poster - bold typography, strong imagery',
          'diagram': '📐 Diagram - technical, clear connections',
          'mindmap': '🧠 Mind map - central concept with branches',
          'timeline': '📅 Timeline - progression and milestones',
          'cartoon': '🎬 Cartoon - comic strip with sequential panels'
        })
        .setValue(this.plugin.settings.imageStyle)
        .onChange(async (value: ImageStyle) => {
          this.plugin.settings.imageStyle = value;
          await this.plugin.saveSettings();
          this.display(); // Refresh to show/hide cartoon cuts settings
        })
      );

    // Cartoon Cuts Settings (only shown when cartoon style is selected)
    if (this.plugin.settings.imageStyle === 'cartoon') {
      new Setting(containerEl)
        .setName('Cartoon panel cuts')
        .setDesc('Number of panels in the comic strip.')
        .addDropdown(dropdown => dropdown
          .addOptions({
            '4': '4 cuts (2×2 grid)',
            '6': '6 cuts (2×3 grid)',
            '8': '8 cuts (2×4 grid)',
            'custom': 'custom number'
          })
          .setValue(this.plugin.settings.cartoonCuts)
          .onChange(async (value: CartoonCuts) => {
            this.plugin.settings.cartoonCuts = value;
            await this.plugin.saveSettings();
            this.display(); // Refresh to show/hide custom input
          })
        );

      // Custom cuts input (only shown when 'custom' is selected)
      if (this.plugin.settings.cartoonCuts === 'custom') {
        new Setting(containerEl)
          .setName('Custom panel count')
          .setDesc('Enter a custom number of panels (2-12 recommended).')
          .addText(text => text
            .setPlaceholder('4')
            .setValue(String(this.plugin.settings.customCartoonCuts))
            .onChange(async (value) => {
              const numValue = parseInt(value) || 4;
              this.plugin.settings.customCartoonCuts = Math.max(2, Math.min(12, numValue));
              await this.plugin.saveSettings();
            })
          );
      }
    }

    new Setting(containerEl)
      .setName('Image resolution')
      .setDesc('Higher resolution = better quality (especially for Korean text). 4K recommended for best results.')
      .addDropdown(dropdown => dropdown
        .addOptions({
          '1K': '1K - standard quality',
          '2K': '2K - high quality',
          '4K': '4K - ultra HD quality (recommended) ⭐'
        })
        .setValue(this.plugin.settings.imageSize)
        .onChange(async (value: ImageSize) => {
          this.plugin.settings.imageSize = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Preferred language')
      .setDesc('Language for text in generated images (e.g., titles, labels, descriptions).')
      .addDropdown(dropdown => dropdown
        .addOptions({
          'ko': '🇰🇷 한국어 (Korean)',
          'en': '🇺🇸 English',
          'ja': '🇯🇵 日本語 (Japanese)',
          'zh': '🇨🇳 中文 (Chinese)',
          'es': '🇪🇸 Español (Spanish)',
          'fr': '🇫🇷 Français (French)',
          'de': '🇩🇪 Deutsch (German)'
        })
        .setValue(this.plugin.settings.preferredLanguage)
        .onChange(async (value: PreferredLanguage) => {
          this.plugin.settings.preferredLanguage = value;
          await this.plugin.saveSettings();
        })
      );

    // ==================== UX Settings Section ====================
    new Setting(containerEl).setName('User experience').setHeading();

    new Setting(containerEl)
      .setName('Show preview before generation')
      .setDesc('Show the generated prompt and allow editing before creating the image.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.showPreviewBeforeGeneration)
        .onChange(async (value) => {
          this.plugin.settings.showPreviewBeforeGeneration = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Show progress modal')
      .setDesc('Display a progress indicator during generation.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.showProgressModal)
        .onChange(async (value) => {
          this.plugin.settings.showProgressModal = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Attachment folder')
      .setDesc('Folder to save generated images. Will be created if it doesn\'t exist.')
      .addText(text => text
        .setPlaceholder('999-Attachments')
        .setValue(this.plugin.settings.attachmentFolder)
        .onChange(async (value) => {
          this.plugin.settings.attachmentFolder = value || '999-Attachments';
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Auto-retry count')
      .setDesc('Number of automatic retries on transient failures (0-5).')
      .addSlider(slider => slider
        .setLimits(0, 5, 1)
        .setValue(this.plugin.settings.autoRetryCount)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.autoRetryCount = value;
          await this.plugin.saveSettings();
        })
      );

    // ==================== Advanced Section ====================
    new Setting(containerEl).setName('Advanced').setHeading();

    new Setting(containerEl)
      .setName('Custom prompt prefix')
      .setDesc('Optional text to prepend to all generated prompts.')
      .addTextArea(textarea => textarea
        .setPlaceholder('e.g., "Create in a minimalist style with blue color scheme..."')
        .setValue(this.plugin.settings.customPromptPrefix)
        .onChange(async (value) => {
          this.plugin.settings.customPromptPrefix = value;
          await this.plugin.saveSettings();
        })
      );

    // ==================== About Section ====================
    new Setting(containerEl).setName('About').setHeading();

    const aboutDiv = containerEl.createDiv({ cls: 'nanobanana-about' });
    aboutDiv.createEl('p', {
      text: 'NanoBanana PRO v1.0.0'
    });
    aboutDiv.createEl('p', {
      text: 'Generate beautiful knowledge posters from your notes using AI.'
    });

    const linksDiv = aboutDiv.createDiv({ cls: 'nanobanana-links' });
    linksDiv.createEl('a', {
      text: '📖 Documentation',
      href: 'https://github.com/username/nanobanana-pro-obsidian#readme'
    });
    linksDiv.createEl('span', { text: ' | ' });
    linksDiv.createEl('a', {
      text: '🐛 Report issue',
      href: 'https://github.com/username/nanobanana-pro-obsidian/issues'
    });
  }
}
