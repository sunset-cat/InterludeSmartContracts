// Required imports
const fs = require("fs");
const ethers = require("ethers");

// Gem and Crystal data
const gems = [
    { name: "Obsidian", power: 100, price: 5000 },
    { name: "Carnelian", power: 200, price: 10000 },
    { name: "Amethyst", power: 420, price: 20000 },
    { name: "Sapphire", power: 1050, price: 50000 },
    { name: "Emerald", power: 2200, price: 100000 },
    { name: "Ruby", power: 4400, price: 200000 },
    { name: "Dragonstone", power: 11500, price: 500000 },
    { name: "Moonstone", power: 24000, price: 1000000 }
];
const crystals = [
    { name: "Rhodonite", power: 100, price: 5000 },
    { name: "Azurite", power: 200, price: 10000 },
    { name: "Chlorophyte", power: 420, price: 20000 },
    { name: "Selenite", power: 1050, price: 50000 },
    { name: "Stormite", power: 2200, price: 100000 },
    { name: "Ember", power: 4400, price: 200000 },
    { name: "Zephyrite", power: 11500, price: 500000 },
    { name: "Pyraxite", power: 24000, price: 1000000 }
];

// Function to write data to a CSV file
function writeCSV(filename, data) {
    const header = "User,AccumulatedEarnings,TotalInvested,UnclaimedEarnings,TotalClaimed,TokenBalance,TokenInAsset,TotalToken\n";
    const rows = data.map(d => `${d.user},${d.accumulatedEarnings},${d.totalInvested},${d.unclaimedEarnings},${d.totalClaimed},${d.tokenBalance},${d.tokenInAsset},${d.totalToken}`).join("\n");
    fs.writeFileSync(filename, header + rows);
    console.log(`Data successfully written to ${filename}`);
}

// Function to read addresses from a CSV file
function readCSV(filename) {
    const data = fs.readFileSync(filename, { encoding: "utf8" });
    return data.split("\n").slice(1).filter(line => line.trim() !== "").map(line => line.split(",")[0].trim());
}

async function main() {
    // Connect to the local network using Hardhat configuration
    const provider = new ethers.JsonRpcProvider("https://cronos-evm-rpc.publicnode.com");
    const privateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // Hardhat default
    const signer = new ethers.Wallet(privateKey, provider);

    // Load the InterludePlatform contract
    const interludePlatformAddress = "0x15710482f05046af569864d5dA17E779C9488cFE"; // Replace with actual address
    const interludePlatformABI = [
        "function allUsers(uint256) view returns (address)",
        "function allUsersLength() view returns (uint256)",
        "function calculateAccumulatedEarnings(address user) view returns (uint256)",
        "function totalInvested(address user) view returns (uint256)",
        "function unclaimedEarnings(address user) view returns (uint256)",
        "function totalClaimed(address user) view returns (uint256)",
        "function getGems(address user) view returns (uint256[] memory)",
        "function getCrystals(address user) view returns (uint256[] memory)"
    ];
    const interludePlatform = new ethers.Contract(interludePlatformAddress, interludePlatformABI, signer);

    // Load the ERC20 contract
    const erc20Address = "0x567d6cAA25aF5617F3218f6b2A8fF956121Fcb5E"; // Replace with actual ERC20 contract address
    const erc20ABI = ["function balanceOf(address account) view returns (uint256)"];
    const erc20 = new ethers.Contract(erc20Address, erc20ABI, signer);

    console.log("Fetching all users...");

    // Get the number of users and fetch all users
    const userCount = 36;
    const allUsers = [];
    for (let i = 0; i < userCount; i++) {
        const user = await interludePlatform.allUsers(i);
        allUsers.push(user);
    }

    // Read additional addresses from airdrop.csv and concatenate them to allUsers
    console.log("Reading addresses from airdrop.csv...");
    const airdropAddresses = readCSV("airdrops.csv");
    const users = [...airdropAddresses, ...allUsers];

    const results = [];
    const userMap = new Map();

    for (const user of users) {
        console.log(`Fetching data for user: ${user}`);

        // Retrieve user data
        const accumulatedEarnings = await interludePlatform.calculateAccumulatedEarnings(user);
        const totalInvested = await interludePlatform.totalInvested(user);
        const unclaimedEarnings = await interludePlatform.unclaimedEarnings(user);
        const totalClaimed = await interludePlatform.totalClaimed(user);

        // Retrieve token balance
        const tokenBalance = await erc20.balanceOf(user);

        // Retrieve gems and crystals
        const userGems = await interludePlatform.getGems(user);
        const userCrystals = await interludePlatform.getCrystals(user);

        // Compute total asset value
        let tokenInAsset = 0;
        userGems.forEach((count, index) => {
            tokenInAsset += Number(count) * gems[index].price;
        });
        userCrystals.forEach((count, index) => {
            tokenInAsset += Number(count) * crystals[index].price;
        });

        // Compute total tokens
        const totalToken = parseFloat(ethers.formatUnits(tokenBalance, 18)) + tokenInAsset;

        // Add user data to map
        userMap.set(user, {
            totalInvested: parseFloat(ethers.formatUnits(totalInvested, 18)),
            totalToken
        });

        results.push({
            user,
            accumulatedEarnings: ethers.formatUnits(accumulatedEarnings, 18),
            totalInvested: ethers.formatUnits(totalInvested, 18),
            unclaimedEarnings: ethers.formatUnits(unclaimedEarnings, 18),
            totalClaimed: ethers.formatUnits(totalClaimed, 18),
            tokenBalance: ethers.formatUnits(tokenBalance, 18),
            tokenInAsset,
            totalToken,
            adjustedEarnings: 0 // Placeholder for now
        });
    }

    // Calculate Adjusted Earnings
    for (let i = 0; i < results.length; i++) {
        const currentUser = results[i];
        const halfInvested = userMap.get(currentUser.user).totalInvested / 2;

        for (let j = 0; j < i; j++) {
            const previousUser = results[j];
            const previousTotalToken = userMap.get(previousUser.user).totalToken;
            const proportion = previousTotalToken / results.slice(0, i).reduce((sum, r) => sum + userMap.get(r.user).totalToken, 0);
            previousUser.adjustedEarnings += halfInvested * proportion;
        }

    }

    // Write results to CSV
    writeCSV("interlude_platform_data.csv", results);
}

main().catch(error => {
    console.error("Error:", error);
    process.exit(1);
});