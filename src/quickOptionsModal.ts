import { App, Modal, Setting } from 'obsidian';
import { ImageStyle, ImageSize, CartoonCuts, IMAGE_STYLES } from './types';

export interface QuickOptionsResult {
  confirmed: boolean;
  imageStyle: ImageStyle;
  imageSize: ImageSize;
  cartoonCuts: CartoonCuts;
  customCartoonCuts: number;
}

export class QuickOptionsModal extends Modal {
  private selectedStyle: ImageStyle;
  private selectedSize: ImageSize;
  private selectedCartoonCuts: CartoonCuts;
  private selectedCustomCuts: number;
  private onSubmit: (result: QuickOptionsResult) => void;
  private cartoonSettingsContainer: HTMLElement | null = null;

  constructor(
    app: App,
    currentStyle: ImageStyle,
    currentSize: ImageSize,
    currentCartoonCuts: CartoonCuts,
    currentCustomCuts: number,
    onSubmit: (result: QuickOptionsResult) => void
  ) {
    super(app);
    this.selectedStyle = currentStyle;
    this.selectedSize = currentSize;
    this.selectedCartoonCuts = currentCartoonCuts;
    this.selectedCustomCuts = currentCustomCuts;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('nanobanana-quick-options');

    // Title
    contentEl.createEl('h2', {
      text: '🎨 Quick Options',
      cls: 'nanobanana-modal-title'
    });

    contentEl.createEl('p', {
      text: 'Choose image style and resolution for this generation.',
      cls: 'nanobanana-modal-desc'
    });

    // Image Style dropdown
    new Setting(contentEl)
      .setName('Image Style')
      .setDesc('Select the visual style for your Knowledge Poster')
      .addDropdown(dropdown => dropdown
        .addOptions({
          'infographic': '📊 Infographic - Charts & Visual Hierarchy',
          'poster': '🎨 Poster - Bold Typography & Imagery',
          'diagram': '📐 Diagram - Technical Connections',
          'mindmap': '🧠 Mind Map - Central Concept & Branches',
          'timeline': '📅 Timeline - Progression & Milestones',
          'cartoon': '🎬 Cartoon - Comic Strip Panels'
        })
        .setValue(this.selectedStyle)
        .onChange((value: ImageStyle) => {
          this.selectedStyle = value;
          this.updateCartoonSettings();
        })
      );

    // Cartoon settings container (dynamically shown/hidden)
    this.cartoonSettingsContainer = contentEl.createDiv({ cls: 'nanobanana-cartoon-settings' });
    this.updateCartoonSettings();

    // Image Resolution dropdown
    new Setting(contentEl)
      .setName('Image Resolution')
      .setDesc('Higher resolution = better quality (4K recommended for Korean text)')
      .addDropdown(dropdown => dropdown
        .addOptions({
          '1K': '1K - Standard Quality',
          '2K': '2K - High Quality',
          '4K': '4K - Ultra HD Quality ⭐'
        })
        .setValue(this.selectedSize)
        .onChange((value: ImageSize) => {
          this.selectedSize = value;
        })
      );

    // Buttons container
    const buttonContainer = contentEl.createDiv({ cls: 'nanobanana-button-container' });

    // Cancel button
    const cancelBtn = buttonContainer.createEl('button', {
      text: 'Cancel',
      cls: 'nanobanana-btn nanobanana-btn-cancel'
    });
    cancelBtn.onclick = () => {
      this.onSubmit({
        confirmed: false,
        imageStyle: this.selectedStyle,
        imageSize: this.selectedSize,
        cartoonCuts: this.selectedCartoonCuts,
        customCartoonCuts: this.selectedCustomCuts
      });
      this.close();
    };

    // Generate button
    const generateBtn = buttonContainer.createEl('button', {
      text: '🚀 Generate Poster',
      cls: 'nanobanana-btn nanobanana-btn-primary'
    });
    generateBtn.onclick = () => {
      this.onSubmit({
        confirmed: true,
        imageStyle: this.selectedStyle,
        imageSize: this.selectedSize,
        cartoonCuts: this.selectedCartoonCuts,
        customCartoonCuts: this.selectedCustomCuts
      });
      this.close();
    };

    // Add styles
    this.addStyles();
  }

  private updateCartoonSettings() {
    if (!this.cartoonSettingsContainer) return;

    // Clear container
    this.cartoonSettingsContainer.empty();

    // Only show cartoon settings when cartoon style is selected
    if (this.selectedStyle !== 'cartoon') {
      this.cartoonSettingsContainer.style.display = 'none';
      return;
    }

    this.cartoonSettingsContainer.style.display = 'block';

    // Cartoon Cuts dropdown
    new Setting(this.cartoonSettingsContainer)
      .setName('Panel Cuts')
      .setDesc('Number of panels in the comic strip')
      .addDropdown(dropdown => dropdown
        .addOptions({
          '4': '4 cuts (2×2 grid)',
          '6': '6 cuts (2×3 grid)',
          '8': '8 cuts (2×4 grid)',
          'custom': 'Custom number'
        })
        .setValue(this.selectedCartoonCuts)
        .onChange((value: CartoonCuts) => {
          this.selectedCartoonCuts = value;
          this.updateCartoonSettings();
        })
      );

    // Custom cuts input (only shown when 'custom' is selected)
    if (this.selectedCartoonCuts === 'custom') {
      new Setting(this.cartoonSettingsContainer)
        .setName('Custom Panel Count')
        .setDesc('Enter number of panels (2-12 recommended)')
        .addText(text => text
          .setPlaceholder('4')
          .setValue(String(this.selectedCustomCuts))
          .onChange((value) => {
            const numValue = parseInt(value) || 4;
            this.selectedCustomCuts = Math.max(2, Math.min(12, numValue));
          })
        );
    }
  }

  private addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .nanobanana-quick-options {
        padding: 20px;
      }
      .nanobanana-modal-title {
        margin: 0 0 8px 0;
        font-size: 1.4em;
      }
      .nanobanana-modal-desc {
        color: var(--text-muted);
        margin-bottom: 20px;
      }
      .nanobanana-button-container {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 20px;
        padding-top: 15px;
        border-top: 1px solid var(--background-modifier-border);
      }
      .nanobanana-btn {
        padding: 8px 16px;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 500;
        border: none;
        transition: all 0.2s ease;
      }
      .nanobanana-btn-cancel {
        background: var(--background-modifier-border);
        color: var(--text-normal);
      }
      .nanobanana-btn-cancel:hover {
        background: var(--background-modifier-hover);
      }
      .nanobanana-btn-primary {
        background: var(--interactive-accent);
        color: var(--text-on-accent);
      }
      .nanobanana-btn-primary:hover {
        background: var(--interactive-accent-hover);
      }
      .nanobanana-cartoon-settings {
        padding: 10px;
        margin: 10px 0;
        border-radius: 8px;
        background: var(--background-secondary);
        border: 1px solid var(--background-modifier-border);
      }
      .nanobanana-cartoon-settings .setting-item {
        padding: 8px 0;
        border-bottom: none;
      }
    `;
    this.contentEl.appendChild(style);
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
