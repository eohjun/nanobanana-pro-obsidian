import { App, Modal } from 'obsidian';
import { ProgressState, ProgressStep, GenerationError, PreferredLanguage } from './types';
import { getMessages, UIMessages } from './i18n';

export class ProgressModal extends Modal {
  private progressContainer: HTMLElement;
  private progressBar: HTMLElement;
  private progressText: HTMLElement;
  private stepsContainer: HTMLElement;
  private cancelButton: HTMLButtonElement;
  private onCancel: (() => void) | null = null;
  private isCancelled = false;
  private messages: UIMessages;

  private steps: { key: ProgressStep; label: string; icon: string }[] = [];

  constructor(app: App, language: PreferredLanguage = 'en') {
    super(app);
    this.messages = getMessages(language);

    // Initialize steps with localized labels
    this.steps = [
      { key: 'analyzing', label: this.messages.stepAnalyzing, icon: '📄' },
      { key: 'generating-prompt', label: this.messages.stepGeneratingPrompt, icon: '🤖' },
      { key: 'generating-image', label: this.messages.stepGeneratingImage, icon: '🎨' },
      { key: 'saving', label: this.messages.stepSaving, icon: '💾' },
      { key: 'embedding', label: this.messages.stepEmbedding, icon: '📎' }
    ];
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('nanobanana-progress-modal');

    // Title
    contentEl.createEl('h2', {
      text: this.messages.progressTitle,
      cls: 'nanobanana-progress-title'
    });

    // Progress bar container
    this.progressContainer = contentEl.createDiv({ cls: 'nanobanana-progress-container' });
    this.progressBar = this.progressContainer.createDiv({ cls: 'nanobanana-progress-bar' });
    this.progressText = this.progressContainer.createDiv({
      cls: 'nanobanana-progress-text',
      text: '0%'
    });

    // Steps container
    this.stepsContainer = contentEl.createDiv({ cls: 'nanobanana-steps-container' });
    this.renderSteps();

    // Estimated time
    contentEl.createDiv({
      cls: 'nanobanana-estimated-time',
      text: this.messages.estimatedTime
    });

    // Cancel button
    const buttonContainer = contentEl.createDiv({ cls: 'nanobanana-button-container' });
    this.cancelButton = buttonContainer.createEl('button', {
      text: this.messages.cancel,
      cls: 'nanobanana-cancel-button'
    });
    this.cancelButton.addEventListener('click', () => {
      this.isCancelled = true;
      if (this.onCancel) {
        this.onCancel();
      }
      this.close();
    });
  }

  private renderSteps() {
    this.stepsContainer.empty();

    for (const step of this.steps) {
      const stepEl = this.stepsContainer.createDiv({ cls: 'nanobanana-step' });
      stepEl.createSpan({ cls: 'nanobanana-step-icon', text: '⏳' });
      stepEl.createSpan({ cls: 'nanobanana-step-label', text: `${step.icon} ${step.label}` });
      stepEl.dataset.step = step.key;
    }
  }

  updateProgress(state: ProgressState) {
    if (this.isCancelled) return;

    // Update progress bar
    this.progressBar.style.width = `${state.progress}%`;
    this.progressText.setText(`${Math.round(state.progress)}%`);

    // Update steps
    const stepIndex = this.steps.findIndex(s => s.key === state.step);
    const stepElements = this.stepsContainer.querySelectorAll('.nanobanana-step');

    stepElements.forEach((el, index) => {
      const iconEl = el.querySelector('.nanobanana-step-icon');
      if (!iconEl) return;

      if (index < stepIndex) {
        // Completed
        el.addClass('completed');
        el.removeClass('active');
        iconEl.setText('✅');
      } else if (index === stepIndex) {
        // Active
        el.addClass('active');
        el.removeClass('completed');
        iconEl.setText('🔄');
      } else {
        // Pending
        el.removeClass('active', 'completed');
        iconEl.setText('⏳');
      }
    });
  }

  showError(error: GenerationError) {
    const { contentEl } = this;

    // Clear and show error
    contentEl.empty();
    contentEl.addClass('nanobanana-error-state');

    contentEl.createEl('h2', {
      text: this.messages.errorTitle,
      cls: 'nanobanana-error-title'
    });

    const errorBox = contentEl.createDiv({ cls: 'nanobanana-error-box' });
    errorBox.createEl('p', { text: error.message });

    if (error.details) {
      errorBox.createEl('p', {
        text: error.details,
        cls: 'nanobanana-error-details'
      });
    }

    // Suggestions based on error type
    const suggestions = this.getErrorSuggestions(error);
    if (suggestions.length > 0) {
      const suggestionBox = contentEl.createDiv({ cls: 'nanobanana-suggestions' });
      suggestionBox.createEl('p', { text: this.messages.errorSolutions });
      const list = suggestionBox.createEl('ul');
      for (const suggestion of suggestions) {
        list.createEl('li', { text: suggestion });
      }
    }

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: 'nanobanana-button-container' });

    if (error.retryable) {
      const retryButton = buttonContainer.createEl('button', {
        text: this.messages.retry,
        cls: 'nanobanana-retry-button mod-cta'
      });
      retryButton.addEventListener('click', () => {
        if (this.onCancel) {
          // Use onCancel as retry trigger
          this.close();
        }
      });
    }

    const closeButton = buttonContainer.createEl('button', {
      text: this.messages.close,
      cls: 'nanobanana-close-button'
    });
    closeButton.addEventListener('click', () => this.close());
  }

  showSuccess(imagePath: string) {
    const { contentEl } = this;

    // Clear and show success
    contentEl.empty();
    contentEl.addClass('nanobanana-success-state');

    contentEl.createEl('h2', {
      text: this.messages.successTitle,
      cls: 'nanobanana-success-title'
    });

    const infoBox = contentEl.createDiv({ cls: 'nanobanana-success-box' });
    infoBox.createEl('p', { text: `${this.messages.successSaved}: ${imagePath}` });

    // Close button with auto-close
    const buttonContainer = contentEl.createDiv({ cls: 'nanobanana-button-container' });
    const closeButton = buttonContainer.createEl('button', {
      text: this.messages.confirm,
      cls: 'nanobanana-close-button mod-cta'
    });
    closeButton.addEventListener('click', () => this.close());

    // Auto close after 3 seconds
    setTimeout(() => {
      if (!this.isCancelled) {
        this.close();
      }
    }, 3000);
  }

  private getErrorSuggestions(error: GenerationError): string[] {
    switch (error.type) {
      case 'INVALID_API_KEY':
        return [
          this.messages.suggestionCheckApiKey,
          this.messages.suggestionVerifyApiKey,
          this.messages.suggestionActivateApiKey
        ];
      case 'RATE_LIMIT':
        return [
          this.messages.suggestionWaitAndRetry,
          this.messages.suggestionCheckQuota
        ];
      case 'NETWORK_ERROR':
        return [
          this.messages.suggestionCheckInternet,
          this.messages.suggestionCheckVPN
        ];
      case 'GENERATION_FAILED':
        return [
          this.messages.suggestionTryDifferentStyle,
          this.messages.suggestionModifyContent
        ];
      case 'CONTENT_FILTERED':
        return [
          this.messages.suggestionModifyContent,
          this.messages.suggestionContentMayBeSensitive
        ];
      case 'NO_CONTENT':
        return [
          this.messages.suggestionAddContent
        ];
      default:
        return [];
    }
  }

  setOnCancel(callback: () => void) {
    this.onCancel = callback;
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
