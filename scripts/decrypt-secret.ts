import { readFileSync } from "fs";
import { createDecipheriv, pbkdf2Sync } from "crypto";

const args = process.argv.slice(2).filter((a) => a !== "--");
const keyFilePath = args[0];
const password = args[1];

if (!keyFilePath || !password) {
    process.exit(1);
}

try {
    const keyFile = JSON.parse(readFileSync(keyFilePath, "utf-8"));
    const { iv, salt, ciphertext, tag } = keyFile.encrypted;

    const key = pbkdf2Sync(password, Buffer.from(salt, "hex"), 100000, 32, "sha256");
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
    decipher.setAuthTag(Buffer.from(tag, "hex"));

    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(ciphertext, "hex")),
        decipher.final(),
    ]);

    const secret = decrypted.toString();

    console.log(`Member:     ${keyFile.memberId}`);
    console.log(`Commitment: ${keyFile.commitment}`);
    console.log(`Secret:     ${secret}`);
    console.log(`\nUse this secret on the Submit page to generate your ZK proof.`);
} catch (e: any) {
    if (e.message?.includes("Unsupported state") || e.code === "ERR_OSSL_BAD_DECRYPT") {
        console.error("Wrong password — decryption failed.");
    } else {
        console.error("Error:", e.message);
    }
    process.exit(1);
}
