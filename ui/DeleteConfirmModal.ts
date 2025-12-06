import { App, Modal } from "obsidian";

export class DeleteConfirmModal extends Modal {
	private fileName: string;
	private onConfirm: () => void;

	constructor(app: App, fileName: string, onConfirm: () => void) {
		super(app);
		this.fileName = fileName;
		this.onConfirm = onConfirm;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Delete Note?" });
		
		contentEl.createEl("p", {
			text: `Are you sure you want to delete "${this.fileName}"?`,
		});
		
		contentEl.createEl("p", {
			text: "This note was created by Canvas Structured Items and will be removed from all canvases.",
			cls: "mod-warning",
		});

		const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });

		const deleteButton = buttonContainer.createEl("button", {
			text: "Delete",
			cls: "mod-warning",
		});
		deleteButton.addEventListener("click", () => {
			this.close();
			this.onConfirm();
		});

		const cancelButton = buttonContainer.createEl("button", {
			text: "Cancel",
			cls: "mod-cta",
		});
		cancelButton.addEventListener("click", () => {
			this.close();
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

