
import * as arp from "../src/arp";

console.log("starting");
import tape = require("tape");
import chalk = require("chalk");
// import util = require("util");

const errorColor = chalk.red.bold;
const okColor = chalk.green.bold;
let level = 0;

function tablevel() {
	let retval = "";
	for (let i = 0; i < level; i++) {
		retval += "\t";
	}
	return retval;
}

const results = {
	passed: 0,
	failed: 0
};

const tapestream = tape.createStream({ objectMode: true });

interface IDataRow {
	type: string;
	ok: boolean;
	operator: string;
	actual: any;
	expected: any;
	id: string;
	name: string;
}

tapestream.on("data", (row: IDataRow) => {
	// console.log(JSON.stringify(row));
	if (typeof row === typeof "") {
		console.log(tablevel() + row);
	} else if (row.type === "end") {
		console.log();
		level--;
	} else if (row.type === "test") {
		level++;
		console.log();
		console.log(tablevel() + "%d. Testing %s", row.id, row.name);
	} else {
		if (row.ok) {
			results.passed++;
			console.log(tablevel() + okColor("%d. \t %s \t %s"), row.id, row.ok, row.name);
			if (row.operator === "throws" && row.actual !== undefined) {
				console.log(tablevel() + okColor(" threw: %s"), row.actual);
			}
		} else {
			results.failed++;
			console.log(tablevel() + errorColor("%d. \t %s \t %s"), row.id, row.ok, row.name);
			console.log(tablevel() + errorColor("\t expected: %s actual: %s"), JSON.stringify(row.expected), JSON.stringify(row.actual));
		}
	}
});

tapestream.on("end", () => {
	console.log("passed:", results.passed);
	console.log("failed:", results.failed);
});

tape("arp", (t) => {
	t.plan(3);
	arp.getMAC("255.255.255.255", (err, result) => {
		if (process.platform.indexOf("win") === 0) {
			t.equal(result.mac, "ff:ff:ff:ff:ff:ff", "got router mac address: " + JSON.stringify(result));
		} else {
			t.pass("can't check generic mac address on anything other than windows os");
		}
	});

	arp.getARPTable(null, (err, result) => {
		t.ok(result.length > 0, "got arp table" + JSON.stringify(result, null, "\t"));
	});

	arp.getMAC("0.0.0.0", (err, result) => {
		t.ok(err, "no mac found");
	});
});
