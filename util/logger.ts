import { App } from "obsidian";

/**
 * Logger utility for the plugin
 * Logs to console and optionally to a log file in the vault
 */
export class Logger {
	private app: App;
	private pluginName: string;
	private logFilePath: string;
	private logBuffer: string[] = [];
	private maxBufferSize = 100;

	constructor(app: App, pluginName: string, logFileName = "plugin.log") {
		this.app = app;
		this.pluginName = pluginName;
		this.logFilePath = `.obsidian/plugins/${pluginName}/${logFileName}`;
	}

	private formatMessage(level: string, message: string, data?: unknown): string {
		const timestamp = new Date().toISOString();
		let formatted = `[${timestamp}] [${level}] ${message}`;

		if (data) {
			formatted += `\n${JSON.stringify(data, null, 2)}`;
		}

		return formatted;
	}

	private async writeToFile(message: string): Promise<void> {
		try {
			// Add to buffer
			this.logBuffer.push(message);

			// Keep buffer size limited
			if (this.logBuffer.length > this.maxBufferSize) {
				this.logBuffer.shift();
			}

			// Try to write to file
			const logDir = this.logFilePath.substring(0, this.logFilePath.lastIndexOf("/"));
			const adapter = this.app.vault.adapter;

			// Ensure directory exists
			if (!(await adapter.exists(logDir))) {
				await adapter.mkdir(logDir);
			}

			// Append to log file
			let existingContent = "";
			if (await adapter.exists(this.logFilePath)) {
				existingContent = await adapter.read(this.logFilePath);
			}

			await adapter.write(this.logFilePath, existingContent + message + "\n");
		} catch (error) {
			// If we can't write to file, just continue
			console.error("Failed to write to log file:", error);
		}
	}

	info(message: string, data?: unknown): void {
		const formatted = this.formatMessage("INFO", message, data);
		console.debug(formatted);
		void this.writeToFile(formatted);
	}

	warn(message: string, data?: unknown): void {
		const formatted = this.formatMessage("WARN", message, data);
		console.warn(formatted);
		void this.writeToFile(formatted);
	}

	error(message: string, data?: unknown): void {
		const formatted = this.formatMessage("ERROR", message, data);
		console.error(formatted);
		void this.writeToFile(formatted);
	}

	debug(message: string, data?: unknown): void {
		const formatted = this.formatMessage("DEBUG", message, data);
		console.debug(formatted);
		void this.writeToFile(formatted);
	}

	/**
	 * Get recent log entries from buffer
	 */
	getRecentLogs(): string[] {
		return [...this.logBuffer];
	}

	/**
	 * Clear the log file
	 */
	async clearLogFile(): Promise<void> {
		try {
			const adapter = this.app.vault.adapter;
			if (await adapter.exists(this.logFilePath)) {
				await adapter.remove(this.logFilePath);
			}
			this.logBuffer = [];
		} catch (error) {
			console.error("Failed to clear log file:", error);
		}
	}
}

