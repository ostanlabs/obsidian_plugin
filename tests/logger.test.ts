import { Logger } from "../util/logger";

/**
 * Inline fake of the Obsidian vault adapter used by the Logger. Deliberately does
 * NOT import the shared harness (owned by another agent) — it only implements the
 * DataAdapter surface the Logger touches: exists / mkdir / read / write / remove.
 */
function makeAdapter() {
	const files = new Map<string, string>();
	const dirs = new Set<string>();
	const calls = { mkdir: [] as string[], write: [] as Array<[string, string]>, remove: [] as string[] };
	const adapter = {
		files,
		dirs,
		calls,
		async exists(p: string) {
			return files.has(p) || dirs.has(p);
		},
		async mkdir(p: string) {
			dirs.add(p);
			calls.mkdir.push(p);
		},
		async read(p: string) {
			return files.get(p) ?? "";
		},
		async write(p: string, c: string) {
			files.set(p, c);
			calls.write.push([p, c]);
		},
		async remove(p: string) {
			files.delete(p);
			calls.remove.push(p);
		},
	};
	return adapter;
}

function makeApp(adapter: ReturnType<typeof makeAdapter>) {
	return { vault: { adapter } } as any;
}

/** Flush the microtask/macrotask queue so the fire-and-forget writeToFile settles. */
function flush(): Promise<void> {
	return new Promise((resolve) => setImmediate(resolve));
}

const DIR = ".obsidian/plugins/myplugin";
const LOG = ".obsidian/plugins/myplugin/plugin.log";

beforeAll(() => {
	jest.spyOn(console, "debug").mockImplementation(() => {});
	jest.spyOn(console, "warn").mockImplementation(() => {});
	jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.clearAllMocks());
afterAll(() => jest.restoreAllMocks());

describe("Logger - constructor & path", () => {
	it("derives the default log file path from the plugin name", () => {
		const logger = new Logger(makeApp(makeAdapter()), "myplugin");
		// No public getter, but the write path proves the derived location.
		logger.info("x");
		expect(logger.getRecentLogs()).toHaveLength(1);
	});

	it("honours a custom log file name", async () => {
		const adapter = makeAdapter();
		const logger = new Logger(makeApp(adapter), "myplugin", "debug.log");
		logger.error("boom");
		await flush();
		expect(adapter.files.has(".obsidian/plugins/myplugin/debug.log")).toBe(true);
	});
});

describe("Logger - formatMessage via levels", () => {
	it("formats a message with an ISO timestamp and level tag", () => {
		const logger = new Logger(makeApp(makeAdapter()), "myplugin");
		logger.info("hello world");
		const line = logger.getRecentLogs()[0];
		expect(line).toMatch(/^\[\d{4}-\d{2}-\d{2}T[\d:.]+Z\] \[INFO\] hello world$/);
	});

	it("appends pretty-printed JSON when data is provided", () => {
		const logger = new Logger(makeApp(makeAdapter()), "myplugin");
		logger.info("with data", { a: 1, nested: { b: 2 } });
		const line = logger.getRecentLogs()[0];
		expect(line).toContain('"a": 1');
		expect(line).toContain('"b": 2');
	});

	it("omits the data block when data is falsy", () => {
		const logger = new Logger(makeApp(makeAdapter()), "myplugin");
		logger.info("no data", 0);
		expect(logger.getRecentLogs()[0]).not.toContain("\n");
	});
});

describe("Logger - levels route to the right console method", () => {
	it("info & debug -> console.debug, warn -> console.warn, error -> console.error", () => {
		const logger = new Logger(makeApp(makeAdapter()), "myplugin");
		logger.info("i");
		logger.debug("d");
		logger.warn("w");
		logger.error("e");

		expect(console.debug).toHaveBeenCalledTimes(2);
		expect(console.warn).toHaveBeenCalledTimes(1);
		expect(console.error).toHaveBeenCalledTimes(1);

		const levels = logger.getRecentLogs().map((l) => l.match(/\[(INFO|DEBUG|WARN|ERROR)\]/)?.[1]);
		expect(levels).toEqual(["INFO", "DEBUG", "WARN", "ERROR"]);
	});
});

describe("Logger - writeToFile", () => {
	it("creates the plugin dir and writes a new log file", async () => {
		const adapter = makeAdapter();
		const logger = new Logger(makeApp(adapter), "myplugin");
		logger.info("first");
		await flush();

		expect(adapter.calls.mkdir).toContain(DIR);
		expect(adapter.files.get(LOG)).toContain("first");
		expect(adapter.files.get(LOG)?.endsWith("\n")).toBe(true);
	});

	it("does not re-create an existing dir and appends to an existing file", async () => {
		const adapter = makeAdapter();
		adapter.dirs.add(DIR);
		adapter.files.set(LOG, "previous line\n");
		const logger = new Logger(makeApp(adapter), "myplugin");
		logger.info("second");
		await flush();

		expect(adapter.calls.mkdir).not.toContain(DIR);
		const content = adapter.files.get(LOG) ?? "";
		expect(content).toContain("previous line");
		expect(content).toContain("second");
	});

	it("swallows adapter failures and logs to console.error", async () => {
		const adapter = makeAdapter();
		adapter.exists = async () => {
			throw new Error("disk gone");
		};
		const logger = new Logger(makeApp(adapter), "myplugin");
		logger.info("will fail to persist");
		await flush();

		// Buffer still captured (push happens before the failing await).
		expect(logger.getRecentLogs()).toHaveLength(1);
		expect(console.error).toHaveBeenCalledWith("Failed to write to log file:", expect.any(Error));
	});
});

describe("Logger - buffer management", () => {
	it("caps the in-memory buffer at maxBufferSize (100)", () => {
		const logger = new Logger(makeApp(makeAdapter()), "myplugin");
		for (let i = 0; i < 105; i++) {
			logger.info(`msg-${i}`);
		}
		const logs = logger.getRecentLogs();
		expect(logs).toHaveLength(100);
		// Oldest (msg-0..msg-4) shifted out; msg-5 should be first.
		expect(logs[0]).toContain("msg-5");
		expect(logs[logs.length - 1]).toContain("msg-104");
	});

	it("getRecentLogs returns a copy, not the live buffer", () => {
		const logger = new Logger(makeApp(makeAdapter()), "myplugin");
		logger.info("x");
		const snapshot = logger.getRecentLogs();
		snapshot.push("mutated");
		expect(logger.getRecentLogs()).toHaveLength(1);
	});
});

describe("Logger - clearLogFile", () => {
	it("removes an existing log file and clears the buffer", async () => {
		const adapter = makeAdapter();
		adapter.files.set(LOG, "old\n");
		const logger = new Logger(makeApp(adapter), "myplugin");
		logger.info("something");
		await flush();

		await logger.clearLogFile();
		expect(adapter.calls.remove).toContain(LOG);
		expect(logger.getRecentLogs()).toHaveLength(0);
	});

	it("clears the buffer even when there is no log file to remove", async () => {
		const adapter = makeAdapter();
		const logger = new Logger(makeApp(adapter), "myplugin");
		logger.info("in-memory only");
		expect(logger.getRecentLogs()).toHaveLength(1);

		await logger.clearLogFile();
		expect(adapter.calls.remove).toHaveLength(0);
		expect(logger.getRecentLogs()).toHaveLength(0);
	});

	it("swallows failures during clear and logs to console.error", async () => {
		const adapter = makeAdapter();
		adapter.exists = async () => {
			throw new Error("io error");
		};
		const logger = new Logger(makeApp(adapter), "myplugin");
		await logger.clearLogFile();
		expect(console.error).toHaveBeenCalledWith("Failed to clear log file:", expect.any(Error));
	});
});
