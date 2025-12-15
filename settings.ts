import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import CanvasStructuredItemsPlugin from "./main";

export class CanvasStructuredItemsSettingTab extends PluginSettingTab {
	plugin: CanvasStructuredItemsPlugin;

	constructor(app: App, plugin: CanvasStructuredItemsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		// Basic options section
		new Setting(containerEl).setName("Basic options").setHeading();

		new Setting(containerEl)
			.setName("Notes base folder")
			.setDesc("Default folder where generated notes will be saved")
			.addText((text) =>
				text
					.setPlaceholder("Projects")
					.setValue(this.plugin.settings.notesBaseFolder)
					.onChange((value) => {
						this.plugin.settings.notesBaseFolder = value;
						void this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Infer base folder from canvas location")
			.setDesc(
				"If enabled, notes will be created in the same folder as the canvas file, ignoring the base folder setting"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.inferBaseFolderFromCanvas)
					.onChange((value) => {
						this.plugin.settings.inferBaseFolderFromCanvas = value;
						void this.plugin.saveSettings();
					})
			);

		// Templates Section
		new Setting(containerEl).setName("Templates").setHeading();

		new Setting(containerEl)
			.setName("Accomplishment template path")
			.setDesc("Path to the accomplishment template file")
			.addText((text) =>
				text
					.setPlaceholder("Templates/canvas-accomplishment-template.md")
					.setValue(this.plugin.settings.accomplishmentTemplatePath)
					.onChange((value) => {
						this.plugin.settings.accomplishmentTemplatePath = value;
						void this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Use template folder")
			.setDesc(
				"Enable to scan a folder for templates and choose from multiple options"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.useTemplateFolder)
					.onChange((value) => {
						this.plugin.settings.useTemplateFolder = value;
						void this.plugin.saveSettings();
						this.display(); // Refresh to show/hide folder setting
					})
			);

		if (this.plugin.settings.useTemplateFolder) {
			new Setting(containerEl)
				.setName("Template folder")
				.setDesc("Folder containing template files to choose from")
				.addText((text) =>
					text
						.setPlaceholder("Templates")
						.setValue(this.plugin.settings.templateFolder)
						.onChange((value) => {
							this.plugin.settings.templateFolder = value;
							void this.plugin.saveSettings();
						})
				);
		}

		new Setting(containerEl)
			.setName("Regenerate default templates")
			.setDesc("Recreate the default template files (existing templates will be overwritten)")
			.addButton((button) =>
				button.setButtonText("Regenerate").onClick(async () => {
					await this.plugin.ensureTemplatesExist(true);
					new Notice("Default templates regenerated");
				})
			);

		// IDs Section
		new Setting(containerEl).setName("ID generation").setHeading();

		new Setting(containerEl)
			.setName("Accomplishment ID prefix")
			.setDesc("Prefix for accomplishment IDs (e.g., 'A' for A001)")
			.addText((text) =>
				text
					.setPlaceholder("A")
					.setValue(this.plugin.settings.idPrefixAccomplishment)
					.onChange((value) => {
						this.plugin.settings.idPrefixAccomplishment = value;
						void this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("ID zero-padding length")
			.setDesc("Number of digits to use for IDs (e.g., 3 for 001)")
			.addText((text) =>
				text
					.setPlaceholder("3")
					.setValue(String(this.plugin.settings.idZeroPadLength))
					.onChange((value) => {
						const num = parseInt(value);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.idZeroPadLength = num;
							void this.plugin.saveSettings();
						}
					})
			);

		// Effort Avenues Section
		new Setting(containerEl).setName("Effort avenues").setHeading();

		new Setting(containerEl)
			.setName("Effort options")
			.setDesc("One effort avenue per line")
			.addTextArea((text) => {
				text.inputEl.rows = 6;
				text.inputEl.cols = 30;
				text.setValue(this.plugin.settings.effortOptions.join("\n")).onChange(
					(value) => {
						this.plugin.settings.effortOptions = value
							.split("\n")
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						void this.plugin.saveSettings();
					}
				);
			});

		new Setting(containerEl)
			.setName("Default effort")
			.setDesc("Default effort avenue to pre-select")
			.addDropdown((dropdown) => {
				this.plugin.settings.effortOptions.forEach((effort) => {
					dropdown.addOption(effort, effort);
				});
				dropdown.setValue(this.plugin.settings.defaultEffort).onChange((value) => {
					this.plugin.settings.defaultEffort = value;
					void this.plugin.saveSettings();
				});
			});

		// Canvas Display Section
		new Setting(containerEl).setName("Canvas display").setHeading();

		new Setting(containerEl)
			.setName("Show ID on cards")
			.setDesc("Include the item ID in card display")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showIdInCanvas)
					.onChange((value) => {
						this.plugin.settings.showIdInCanvas = value;
						void this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Shape label")
			.setDesc("Shape name to write into canvas metadata for accomplishments")
			.addText((text) =>
				text
					.setPlaceholder("accomplishment")
					.setValue(this.plugin.settings.shapeAccomplishment)
					.onChange((value) => {
						this.plugin.settings.shapeAccomplishment = value || "accomplishment";
						void this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Effort color map")
			.setDesc("One mapping per line: Effort:ColorId (Obsidian color index or hex)")
			.addTextArea((text) => {
				text.inputEl.rows = 6;
				text.inputEl.cols = 30;
				text.setValue(
					Object.entries(this.plugin.settings.effortColorMap)
						.map(([effort, color]) => `${effort}:${color}`)
						.join("\n")
				).onChange((value) => {
					const map: Record<string, string> = {};
					value
						.split("\n")
						.map((line) => line.trim())
						.filter((line) => line.length > 0)
						.forEach((line) => {
							const [key, val] = line.split(/[:=]/);
							if (key && val) {
								map[key.trim()] = val.trim();
							}
						});
					// Only update if we parsed something, otherwise keep existing mapping
					this.plugin.settings.effortColorMap = Object.keys(map).length > 0 ? map : this.plugin.settings.effortColorMap;
					void this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("In Progress color")
			.setDesc("Obsidian color index for nodes marked as 'In Progress' (1=red, 2=orange, 3=yellow, 4=green, 5=cyan, 6=purple)")
			.addText((text) =>
				text
					.setPlaceholder("1")
					.setValue(this.plugin.settings.inProgressColor)
					.onChange((value) => {
						this.plugin.settings.inProgressColor = value || "1";
						void this.plugin.saveSettings();
					})
			);

		// Notion Integration Section
		new Setting(containerEl).setName("Notion integration").setHeading();

		new Setting(containerEl)
			.setName("Enable Notion sync")
			.setDesc("Enable syncing items to Notion database")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.notionEnabled).onChange((value) => {
					this.plugin.settings.notionEnabled = value;
					void this.plugin.saveSettings();
					this.display(); // Refresh to show/hide conditional settings
				})
			);

		if (this.plugin.settings.notionEnabled) {
			new Setting(containerEl)
				.setName("Integration token")
				.setDesc("Notion internal integration token")
				.addText((text) => {
					text.inputEl.type = "password";
					text.setPlaceholder("secret_...")
						.setValue(this.plugin.settings.notionIntegrationToken)
						.onChange((value) => {
							this.plugin.settings.notionIntegrationToken = value;
							void this.plugin.saveSettings();
						});
				});

			new Setting(containerEl)
				.setName("Parent page ID")
				.setDesc("Notion page ID where the database will be created")
				.addText((text) =>
					text
						.setPlaceholder("abc123...")
						.setValue(this.plugin.settings.notionParentPageId)
						.onChange((value) => {
							this.plugin.settings.notionParentPageId = value;
							void this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName("Database name")
				.setDesc("Name for the Notion database")
				.addText((text) =>
					text
						.setPlaceholder("Obsidian Canvas Items")
						.setValue(this.plugin.settings.notionDatabaseName)
						.onChange((value) => {
							this.plugin.settings.notionDatabaseName = value;
							void this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName("Database ID")
				.setDesc("Notion database ID (filled after initialization)")
				.addText((text) => {
					text.setValue(this.plugin.settings.notionDatabaseId).onChange(
						(value) => {
							this.plugin.settings.notionDatabaseId = value;
							void this.plugin.saveSettings();
						}
					);
				});

			new Setting(containerEl)
				.setName("Initialize Notion database")
				.setDesc("Create a new database in Notion with the required schema")
				.addButton((button) =>
					button
						.setButtonText("Initialize")
						.setCta()
						.onClick(() => {
							void this.plugin.initializeNotionDatabase();
						})
				);

			new Setting(containerEl)
				.setName("Sync on note creation")
				.setDesc("Automatically sync to Notion when a new note is created")
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.syncOnNoteCreate)
						.onChange((value) => {
							this.plugin.settings.syncOnNoteCreate = value;
							void this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName("Sync on demand only")
				.setDesc("Disable automatic sync; only sync via manual command")
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.syncOnDemandOnly)
						.onChange((value) => {
							this.plugin.settings.syncOnDemandOnly = value;
							void this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName("Auto-sync on MD file change")
				.setDesc("Automatically sync to Notion when a markdown file is modified (with 2s debounce)")
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.autoSyncOnMdChange)
						.onChange((value) => {
							this.plugin.settings.autoSyncOnMdChange = value;
							void this.plugin.saveSettings();
						})
				);
		}
	}
}

