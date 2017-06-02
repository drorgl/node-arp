import util = require("util");
import child_process = require("child_process");
const spawn = child_process.spawn;

/**
 * Read the MAC address from the ARP table.
 *
 * 3 methods for lin/win/mac  Linux reads /proc/net/arp
 * mac and win read the output of the arp command.
 *
 * all 3 ping the IP first without checking the response to encourage the
 * OS to update the arp table.
 *
 * 31/12/2014 -- Changelog by Leandre Gohy (leandre.gohy@hexeo.be)
 * - FIX : ping command for windows (-n not -c)
 *
 * 26/08/2013 -- Changelog by Leandre Gohy (leandre.gohy@hexeo.be)
 * - FIX : arp command for OSX (-n not -an)
 * - MODIFY : rewrite Linux lookup function to avoid looping over all entries and returned lines (arp -n IPADDRESS)
 * - MODIFY : rewrite OSX lookup function to avoid looping over all returned lines
 * - FIX : OSX formates double zero as a single one (i.e : 0:19:99:50:3a:3 instead of 00:19:99:50:3a:3)
 * - FIX : lookup functions did not returns the function on error causing callback to be called twice
 * - FIX : Windows lookup function returns wrong mac address due to indexOf usage (192.168.1.1 -> 192.168.1.10)
 *
 */
export function getMAC(ipaddress: string, cb: (err: Error, result?: IARPRecord) => void) {
	if (process.platform.indexOf("linux") === 0) {
		readMACLinux(ipaddress, cb);
	} else if (process.platform.indexOf("win") === 0) {
		readMACWindows(ipaddress, cb);
	}
	// else if (process.platform.indexOf("darwin") === 0) {
	// 	readMACMac(ipaddress, cb);
	// }
}

export function getARPTable(ipaddress: string, cb: (err: Error, result?: IARPRecord[]) => void) {
	if (process.platform.indexOf("linux") === 0) {
		readARPLinux(ipaddress, cb);
	} else if (process.platform.indexOf("win") === 0) {
		readARPWindows(ipaddress, cb);
	}
	// else if (process.platform.indexOf("darwin") === 0) {
	// 	readMACMac(ipaddress, cb);
	// }
}

/**
 * read from arp -n IPADDRESS
 */
export function readMACLinux(ipaddress: string, cb: (err: Error, result?: IARPRecord) => void) {

	// ping the ip address to encourage the kernel to populate the arp tables
	const ping = spawn("ping", ["-c", "1", ipaddress]);

	ping.on("close", (ping_code) => {
		// not bothered if ping did not work

		readARPLinux(ipaddress, (arp_err, arp_results) => {
			if (arp_err) {
				cb(arp_err);
				return;
			}

			if (!arp_results || arp_results.length === 0) {
				cb(new Error("no results"));
				return;
			}

			cb(null, arp_results[0]);
		});
	});

}

export interface IARPRecord {
	name: string;
	ip: string;
	mac: string;
	interface: string;
}

function normalize_arp_ip(ip: string): string {
	if (ip.startsWith("(") && ip.endsWith(")")) {
		return ip.substr(1, ip.length - 2);
	}
	return ip;
}

function normalize_mac(mac: string): string {
	return mac.replace(/[:-]/g, ":");
}

export function readARPLinux(ipaddress: string, cb: (err: Error, result?: IARPRecord[]) => void) {
	let arp: child_process.ChildProcess;
	if (ipaddress) {
		arp = spawn("arp", ["-a", ipaddress]);
	} else {
		arp = spawn("arp", ["-a"]);
	}
	let buffer = "";
	let errstream = "";
	arp.stdout.on("data", (data) => {
		buffer += data;
	});
	arp.stderr.on("data", (data) => {
		errstream += data;
	});

	arp.on("close", (code) => {
		if (code !== 0) {
			console.log("Error running arp " + code + " " + errstream);
			cb(new Error("Error running arp " + code + " " + errstream));
			return;
		}

		// Parse this format
		// Lookup succeeded : Address                  HWtype  HWaddress           Flags Mask            Iface
		// 					IPADDRESS	              ether   MACADDRESS   C                     IFACE
		// Lookup failed : HOST (IPADDRESS) -- no entry
		// There is minimum two lines when lookup is successful

		// new format:
		// gateway (10.0.0.138) at e8:fc:af:a1:f7:17 [ether] on wlan0
		const table = buffer.split("\n").filter((v) => (v != null) && (v !== ""));
		if (table.length >= 1 && buffer.indexOf("no match found") === -1) {
			const result = table.map((v, i, a) => {
				const sections = v.split(" ");
				const arp_record: IARPRecord = {
					name: sections[0],
					ip: (sections.length > 1) ? normalize_arp_ip(sections[1]) : null,
					mac: (sections.length > 3) ? normalize_mac(sections[3]) : null,
					interface: (sections.length > 6) ? sections[6] : null
				};
				return arp_record;
			});
			// const parts = table[1].split(" ").filter(String);
			cb(null, result); // parts[2]);
			return;
		}
		cb(new Error("Could not find ip in arp table: " + ipaddress));
	});
}

/**
 * read from arp -a IPADDRESS
 */
export function readMACWindows(ipaddress: string, cb: (err: Error, result?: IARPRecord) => void) {

	// ping the ip address to encourage the kernel to populate the arp tables
	const ping = spawn("ping", ["-n", "1", ipaddress]);

	ping.on("close", (ping_code) => {
		// not bothered if ping did not work
		readARPWindows(ipaddress, (arp_err, arp_result) => {
			if (arp_err) {
				cb(arp_err);
				return;
			}

			if (arp_result.length) {
				cb(null, arp_result[0]);
				return;
			}

			cb(new Error("no results"));
		});
	});

}

export function readARPWindows(ipaddress: string, cb: (err: Error, result?: IARPRecord[]) => void) {
	let arp: child_process.ChildProcess;
	if (ipaddress) {
		arp = spawn("arp", ["-a", ipaddress]);
	} else {
		arp = spawn("arp", ["-a", "-v"]);
	}
	let buffer = "";
	let errstream = "";

	arp.stdout.on("data", (data) => {
		buffer += data;
	});
	arp.stderr.on("data", (data) => {
		errstream += data;
	});

	arp.on("close", (code) => {
		if (code !== 0) {
			// console.log("Error running arp " + code + " " + errstream);
			cb(new Error("Error running arp " + code + " " + errstream));
			return;
		}

		if (buffer.indexOf("No ARP Entries Found") !== -1) {
			cb(new Error("Count not find ip in arp table: " + ipaddress));
			return;
		}

		const table = buffer.split("\r\n").filter((v) => (v != null) && (v !== ""));

		let current_interface = "";
		let arp_results = table.map((v, i, a) => {
			const row = v.trim();
			const parts = row.split(" ").filter((fv) => (fv != null) && (fv !== ""));
			if (row.startsWith("Interface:")) {
				current_interface = parts[1];
				// Internet Address      Physical Address      Type
			} else if (parts[0] === "Internet" && parts[1] === "Address" && parts[2] === "Physical" && parts[3] === "Address" && parts[4] === "Type") {
				// nop
			} else {
				const arp_result: IARPRecord = {
					ip: parts[0],
					mac: (parts.length > 1) ? normalize_mac(parts[1]) : null,
					interface: current_interface,
					name: null
				};
				return arp_result;
			}
			return null;
		});

		arp_results = arp_results.filter((v) => (v != null));
		if (arp_results.length > 0) {
			cb(null, arp_results);
			return;
		}

		cb(new Error("Count not find ip in arp table: " + ipaddress));
	});
}

// /**
//  * read from arp -n IPADDRESS
//  */
// export function readMACMac(ipaddress: string, cb: (err: Error, result?: IARPRecord) => void) {

// 	// ping the ip address to encourage the kernel to populate the arp tables
// 	const ping = spawn("ping", ["-c", "1", ipaddress]);

// 	ping.on("close", (ping_code) => {
// 		// not bothered if ping did not work

// 		const arp = spawn("arp", ["-n", ipaddress]);
// 		let buffer = "";
// 		let errstream = "";
// 		arp.stdout.on("data", (data) => {
// 			buffer += data;
// 		});
// 		arp.stderr.on("data", (data) => {
// 			errstream += data;
// 		});

// 		arp.on("close", (code) => {
// 			// On lookup failed OSX returns code 1
// 			// but errstream will be empty
// 			if (code !== 0 && errstream !== "") {
// 				// console.log("Error running arp " + code + " " + errstream);
// 				cb(new Error("Error running arp " + code + " " + errstream));
// 				return;
// 			}

// 			// parse this format
// 			// Lookup succeeded : HOST (IPADDRESS) at MACADDRESS on IFACE ifscope [ethernet]
// 			// Lookup failed : HOST (IPADDRESS) -- no entry
// 			const parts = buffer.split(" ").filter(String);
// 			if (parts[3] !== "no") {
// 				const mac = parts[3].replace(/^0:/g, "00:").replace(/:0:/g, ":00:").replace(/:0$/g, ":00");
// 				cb(null, mac);
// 				return;
// 			}

// 			cb(new Error("Count not find ip in arp table: " + ipaddress));
// 		});
// 	});

// }
