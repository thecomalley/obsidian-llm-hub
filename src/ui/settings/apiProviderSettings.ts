import { Setting, Notice, Modal, App, Platform } from "obsidian";
import { t } from "src/i18n";
import type { ApiProviderConfig, ApiProviderType } from "src/types";
import { DEFAULT_AZURE_API_VERSION, KNOWN_PROVIDER_DEFAULTS } from "src/types";
import { verifyApiProvider, verifyAzureOpenAiProvider, verifyOpencodeGo } from "src/core/openaiProvider";
import { verifyAnthropicProvider } from "src/core/anthropicProvider";
import { verifyGeminiProvider } from "src/core/gemini";
import { getKnownModels, OPENCODE_GO_FALLBACK_MODELS } from "src/core/modelPricing";
import type { SettingsContext } from "./settingsContext";

function normalizeAzureDeployments(value: string | string[] | undefined): string[] {
  const items = Array.isArray(value)
    ? value
    : (value ?? "").split(/\r?\n/);
  return Array.from(new Set(items.map(item => item.trim()).filter(Boolean)));
}

function deploymentsToText(deployments: string[] | undefined): string {
  return (deployments ?? []).join("\n");
}

function isAzureProvider(config: Pick<ApiProviderConfig, "type">): boolean {
  return config.type === "azure";
}

export function displayApiProviderSettings(containerEl: HTMLElement, ctx: SettingsContext): void {
  if (Platform.isMobile) return;

  const { plugin, display } = ctx;
  const app = plugin.app;

  new Setting(containerEl).setName(t("settings.apiProviders")).setHeading();

  new Setting(containerEl)
    .setDesc(t("settings.apiProviders.desc"));

  for (const provider of plugin.settings.apiProviders) {
    const modelInfo = provider.enabledModels.length > 0 ? ` (${provider.enabledModels.join(", ")})` : "";
    const isKnown = !!KNOWN_PROVIDER_DEFAULTS[provider.type];
    const providerDesc = provider.type === "azure"
      ? provider.baseUrl
      : (isKnown ? "" : provider.baseUrl);
    const providerSetting = new Setting(containerEl)
      .setName(`${provider.name}${modelInfo}`)
      .setDesc(providerDesc);

    const statusEl = providerSetting.controlEl.createDiv({ cls: "llm-hub-cli-row-status" });
    if (provider.verified && provider.enabled) {
      statusEl.addClass("llm-hub-cli-status--success");
      statusEl.textContent = t("settings.cliVerified");
    } else if (!provider.enabled) {
      statusEl.textContent = t("settings.apiProviderDisabled");
    }

    providerSetting.addToggle((toggle) =>
      toggle
        .setValue(provider.enabled)
        .onChange(async (value) => {
          provider.enabled = value;
          await plugin.saveSettings();
          display();
        })
    );

    providerSetting.addExtraButton((button) =>
      button
        .setIcon("settings")
        .setTooltip(t("settings.apiProviderEdit"))
        .onClick(() => {
          new ApiProviderModal(app, provider, async (updated) => {
            const idx = plugin.settings.apiProviders.findIndex(p => p.id === provider.id);
            if (idx >= 0) {
              plugin.settings.apiProviders[idx] = updated;
              await plugin.saveSettings();
              display();
            }
          }, plugin.settings.proxyUrl, plugin.settings.proxyBypass).open();
        })
    );

    providerSetting.addExtraButton((button) =>
      button
        .setIcon("trash")
        .setTooltip(t("settings.apiProviderDelete"))
        .onClick(async () => {
          plugin.settings.apiProviders = plugin.settings.apiProviders.filter(p => p.id !== provider.id);
          await plugin.saveSettings();
          display();
        })
    );
  }

  new Setting(containerEl)
    .addButton((btn) =>
      btn
        .setButtonText(t("settings.apiProviderAdd"))
        .setCta()
        .onClick(() => {
          const newProvider: ApiProviderConfig = {
            id: `provider_${Date.now()}`,
            name: "Gemini",
            type: "gemini",
            baseUrl: KNOWN_PROVIDER_DEFAULTS.gemini.baseUrl,
            apiKey: "",
            enabledModels: [],
            availableModels: [],
            verified: false,
            enabled: true,
          };
          new ApiProviderModal(app, newProvider, async (created) => {
            plugin.settings.apiProviders.push(created);
            await plugin.saveSettings();
            display();
          }, plugin.settings.proxyUrl, plugin.settings.proxyBypass).open();
        })
    );
}

class ApiProviderModal extends Modal {
  private config: ApiProviderConfig;
  private onSave: (config: ApiProviderConfig) => Promise<void>;
  private proxyUrl?: string;
  private proxyBypass?: string;

  constructor(app: App, config: ApiProviderConfig, onSave: (config: ApiProviderConfig) => Promise<void>, proxyUrl?: string, proxyBypass?: string) {
    super(app);
    this.config = { ...config };
    this.onSave = onSave;
    this.proxyUrl = proxyUrl;
    this.proxyBypass = proxyBypass;
    this.normalizeAzureFields();
  }

  private invalidateVerification(): void {
    this.config.verified = false;
  }

  private normalizeAzureFields(): void {
    if (!isAzureProvider(this.config)) return;
    this.config.name = KNOWN_PROVIDER_DEFAULTS.azure.displayName;
    this.config.baseUrl = this.config.baseUrl.trim().replace(/\/+$/, "");
    this.config.azureApiVersion = this.config.azureApiVersion?.trim() || DEFAULT_AZURE_API_VERSION;
    const deployments = normalizeAzureDeployments(
      this.config.azureDeployments && this.config.azureDeployments.length > 0
        ? this.config.azureDeployments
        : (this.config.availableModels.length > 0 ? this.config.availableModels : this.config.enabledModels)
    );
    this.config.azureDeployments = deployments;
    this.config.availableModels = [...deployments];
    this.config.enabledModels = [...deployments];
  }

  private setAzureDeployments(value: string): void {
    const deployments = normalizeAzureDeployments(value);
    this.config.azureDeployments = deployments;
    this.config.availableModels = [...deployments];
    this.config.enabledModels = [...deployments];
    this.invalidateVerification();
  }

  onOpen() {
    const { contentEl } = this;
    const isAzure = isAzureProvider(this.config);

    contentEl.empty();
    contentEl.createEl("h3", { text: t("settings.apiProviderConfigure") });

    new Setting(contentEl)
      .setName(t("settings.apiProviderType"))
      .addDropdown((dropdown) => {
        dropdown.addOption("gemini", "Gemini");
        dropdown.addOption("openai", "OpenAI");
        dropdown.addOption("azure", "Azure OpenAI");
        dropdown.addOption("anthropic", "Anthropic");
        dropdown.addOption("openrouter", "OpenRouter");
        dropdown.addOption("grok", "Grok");
        dropdown.addOption("opencodego", "OpenCode Go");
        dropdown.addOption("opencodezen", "OpenCode Zen");
        dropdown.addOption("custom", t("settings.apiProviderCustom"));
        dropdown.setValue(this.config.type);
        dropdown.onChange((value) => {
          this.config.type = value as ApiProviderType;
          this.invalidateVerification();

          const defaults = KNOWN_PROVIDER_DEFAULTS[value];
          if (value === "azure") {
            this.config.name = KNOWN_PROVIDER_DEFAULTS.azure.displayName;
            this.config.baseUrl = "";
            this.config.azureApiVersion = DEFAULT_AZURE_API_VERSION;
            this.config.azureDeployments = [];
            this.config.availableModels = [];
            this.config.enabledModels = [];
          } else if (defaults) {
            this.config.baseUrl = defaults.baseUrl;
            this.config.name = defaults.displayName;
            this.config.availableModels = [];
            this.config.enabledModels = [];
            this.config.azureApiVersion = undefined;
            this.config.azureDeployments = undefined;
          } else {
            this.config.name = this.config.name === KNOWN_PROVIDER_DEFAULTS.azure.displayName ? "" : this.config.name;
            this.config.baseUrl = "";
            this.config.availableModels = [];
            this.config.enabledModels = [];
            this.config.azureApiVersion = undefined;
            this.config.azureDeployments = undefined;
          }

          this.onOpen();
        });
      });

    const isKnownProvider = !!KNOWN_PROVIDER_DEFAULTS[this.config.type];
    if (isKnownProvider) {
      this.config.name = KNOWN_PROVIDER_DEFAULTS[this.config.type].displayName;
      if (!isAzure) {
        this.config.baseUrl = KNOWN_PROVIDER_DEFAULTS[this.config.type].baseUrl;
      }
    } else {
      new Setting(contentEl)
        .setName(t("settings.apiProviderName"))
        .addText((text) =>
          text
            .setPlaceholder("My Provider")
            .setValue(this.config.name)
            .onChange((value) => {
              this.config.name = value.trim();
            })
        );

      new Setting(contentEl)
        .setName(t("settings.apiProviderBaseUrl"))
        .addText((text) =>
          text
            .setPlaceholder("https://api.openai.com")
            .setValue(this.config.baseUrl)
            .onChange((value) => {
              this.config.baseUrl = value.trim();
              this.invalidateVerification();
            })
        );
    }

    if (isAzure) {
      new Setting(contentEl)
        .setName(t("settings.azureProviderEndpoint"))
        .addText((text) =>
          text
            .setPlaceholder(t("settings.azureProviderEndpoint.placeholder"))
            .setValue(this.config.baseUrl)
            .onChange((value) => {
              this.config.baseUrl = value.trim().replace(/\/+$/, "");
              this.invalidateVerification();
            })
        );
    }

    new Setting(contentEl)
      .setName(isAzure ? t("settings.azureProviderApiKey") : t("settings.apiProviderApiKey"))
      .addText((text) => {
        text
          .setPlaceholder(t("settings.googleApiKey.placeholder"))
          .setValue(this.config.apiKey)
          .onChange((value) => {
            this.config.apiKey = value.trim();
            this.invalidateVerification();
          });
        text.inputEl.type = "password";
      });

    if (isAzure) {
      new Setting(contentEl)
        .setName(t("settings.azureProviderApiVersion"))
        .addText((text) =>
          text
            .setPlaceholder(t("settings.azureProviderApiVersion.placeholder"))
            .setValue(this.config.azureApiVersion || DEFAULT_AZURE_API_VERSION)
            .onChange((value) => {
              this.config.azureApiVersion = value.trim();
              this.invalidateVerification();
            })
        );

      const deploymentsSetting = new Setting(contentEl)
        .setName(t("settings.azureProviderDeployments"))
        .setDesc(t("settings.azureProviderDeployments.desc"));
      deploymentsSetting.settingEl.addClass("llm-hub-settings-textarea-container");
      deploymentsSetting.addTextArea((text) => {
        text
          .setPlaceholder(t("settings.azureProviderDeployments.placeholder"))
          .setValue(deploymentsToText(this.config.azureDeployments))
          .onChange((value) => {
            this.setAzureDeployments(value);
          });
        text.inputEl.rows = 4;
        text.inputEl.addClass("llm-hub-settings-textarea");
      });
    } else {
      const knownModels = getKnownModels(this.config.type);
      const fetchedModels = this.config.availableModels;
      const modelChoices = knownModels.length > 0
        ? [...knownModels, ...fetchedModels.filter(m => !knownModels.includes(m))]
        : fetchedModels;

      if (modelChoices.length > 0) {
        const modelSetting = new Setting(contentEl)
          .setName(t("settings.apiProviderModel"))
          .setDesc(t("settings.apiProviderModel.desc"));

        const items: HTMLElement[] = [];
        if (modelChoices.length > 20) {
          const filterInput = modelSetting.controlEl.createEl("input", {
            type: "text",
            placeholder: t("settings.apiProviderModelFilter"),
            cls: "llm-hub-model-filter",
          });
          filterInput.addEventListener("input", () => {
            const query = filterInput.value.toLowerCase();
            for (const item of items) {
              const name = item.textContent?.toLowerCase() ?? "";
              item.toggleClass("llm-hub-hidden", !name.includes(query));
            }
          });
        }

        const listEl = modelSetting.controlEl.createDiv({ cls: "llm-hub-model-checklist" });
        for (const m of modelChoices) {
          const label = listEl.createEl("label", { cls: "llm-hub-model-check-item" });
          const cb = label.createEl("input", { type: "checkbox" });
          cb.checked = this.config.enabledModels.includes(m);
          cb.addEventListener("change", () => {
            if (cb.checked) {
              if (!this.config.enabledModels.includes(m)) {
                this.config.enabledModels.push(m);
              }
            } else {
              this.config.enabledModels = this.config.enabledModels.filter(x => x !== m);
            }
          });
          label.createSpan({ text: m });
          items.push(label);
        }
      } else if (!this.config.verified) {
        new Setting(contentEl)
          .setName(t("settings.apiProviderModel"))
          .setDesc(t("settings.apiProviderVerifyRequired"));
      }
    }

    const buttonSetting = new Setting(contentEl);

    buttonSetting.addButton((btn) =>
      btn
        .setButtonText(t("settings.apiProviderVerify"))
        .onClick(async () => {
          btn.setDisabled(true);
          btn.setButtonText(t("settings.cliVerifying"));
          try {
            let result: { success: boolean; error?: string; models?: string[] };
            if (isAzureProvider(this.config)) {
              result = await verifyAzureOpenAiProvider(
                this.config.baseUrl,
                this.config.apiKey,
                this.config.azureApiVersion || DEFAULT_AZURE_API_VERSION,
                this.config.azureDeployments ?? [],
                this.proxyUrl,
                this.proxyBypass,
              );
            } else if (this.config.type === "opencodego") {
              const probe = await verifyOpencodeGo(this.config.baseUrl, this.config.apiKey, this.proxyUrl, this.proxyBypass);
              result = probe.success
                ? { success: true, models: OPENCODE_GO_FALLBACK_MODELS }
                : { success: false, error: probe.error };
            } else if (this.config.type === "gemini") {
              result = await verifyGeminiProvider(this.config.apiKey, this.proxyUrl, this.proxyBypass);
            } else if (this.config.type === "anthropic") {
              result = await verifyAnthropicProvider(this.config.baseUrl, this.config.apiKey, this.proxyUrl, this.proxyBypass);
            } else {
              result = await verifyApiProvider(this.config.baseUrl, this.config.apiKey, this.proxyUrl, this.proxyBypass);
            }

            if (result.success) {
              this.config.verified = true;
              const models = result.models || [];
              this.config.availableModels = models;
              if (isAzureProvider(this.config)) {
                this.config.azureDeployments = [...models];
                this.config.enabledModels = [...models];
              }
              new Notice(t("settings.apiProviderVerified", { count: String(this.config.availableModels.length) }));
              this.onOpen();
            } else {
              new Notice(t("settings.apiProviderVerifyFailed", { error: result.error || "Unknown error" }));
            }
          } catch (error) {
            new Notice(t("settings.apiProviderVerifyFailed", { error: error instanceof Error ? error.message : String(error) }));
          } finally {
            btn.setDisabled(false);
            btn.setButtonText(t("settings.apiProviderVerify"));
          }
        })
    );

    buttonSetting.addButton((btn) =>
      btn
        .setButtonText(t("common.save"))
        .setCta()
        .onClick(async () => {
          if (!this.config.name) {
            new Notice(t("settings.apiProviderNameRequired"));
            return;
          }
          if (isAzureProvider(this.config) && !this.config.baseUrl) {
            new Notice(t("settings.azureProviderEndpointRequired"));
            return;
          }
          if (!this.config.apiKey) {
            new Notice(t("settings.apiProviderApiKeyRequired"));
            return;
          }
          if (isAzureProvider(this.config) && !(this.config.azureApiVersion?.trim())) {
            new Notice(t("settings.azureProviderApiVersionRequired"));
            return;
          }
          if (isAzureProvider(this.config) && (this.config.azureDeployments?.length ?? 0) === 0) {
            new Notice(t("settings.azureProviderDeploymentsRequired"));
            return;
          }
          if (!this.config.verified) {
            new Notice(t("settings.apiProviderVerifyRequired"));
            return;
          }
          await this.onSave(this.config);
          this.close();
        })
    );
  }

  onClose() {
    this.contentEl.empty();
  }
}
