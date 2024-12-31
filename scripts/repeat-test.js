const { exec } = require("child_process");

const repeatCount = 120;

(async function runTests() {
    for (let i = 0; i < repeatCount; i++) {
        console.log(`Running test iteration: ${i + 1}`);
        await new Promise((resolve, reject) => {
            exec("npx hardhat test", (error, stdout, stderr) => {
                if (error) {
                    console.error(`Test failed on iteration ${i + 1}`);
                    reject(error);
                } else {
                    console.log(stdout);
                    resolve();
                }
            });
        });
    }
})();
