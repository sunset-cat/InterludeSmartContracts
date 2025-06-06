const { ethers } = require("hardhat");
const fs = require('fs');
const sleepTime = 3000;

async function main() {
    // Constants
    const initialSupply = ethers.parseUnits("1000000000", 18);

    // get owner
    const [owner] = await ethers.getSigners();
    const nonce = await owner.getNonce();
    console.log(nonce,'is nonce');
    //token
    console.log("Deploying token...")
    const Token = await ethers.getContractFactory("MyPausableToken",);
    const token = await Token.deploy("Interlude", "INT", initialSupply,{ nonce: await owner.getNonce() });
    console.log("Token deployed at address " + await getContractAddress(token))
    await sleep(sleepTime);

    //main contract
    console.log("Deploying platform...")
    const InterludePlatform = await ethers.getContractFactory("InterludePlatform");
    const interludePlatform = await InterludePlatform.deploy(owner.address, await getContractAddress(token),{ nonce: await owner.getNonce() });
    console.log("Platform deployed at address " + await getContractAddress(interludePlatform))

    await sleep(sleepTime);
    // Deploy and set whitelist contracts
    console.log("Deploying whitelist contracts");
    const Whitelist = await ethers.getContractFactory("Whitelist");

    console.log('Deploying partner whitelist');
    const partnersWhitelist = await Whitelist.deploy({ nonce: await owner.getNonce() });
    await sleep(sleepTime);
    console.log('Deploying general whitelist');
    const generalWhitelist = await Whitelist.deploy({ nonce: await owner.getNonce() });
    await sleep(sleepTime);
    console.log('Deploying admin whitelist');
    const adminWhitelist = await Whitelist.deploy({ nonce: await owner.getNonce() });
    await sleep(sleepTime);

    console.log('Setting partner whitelist');
    await interludePlatform.connect(owner).setPartnersWhitelist(await getContractAddress(partnersWhitelist),{ nonce: await owner.getNonce() });
    await sleep(sleepTime);
    console.log('Setting general whitelist');
    await interludePlatform.connect(owner).setGeneralWhitelist(await getContractAddress(generalWhitelist),{ nonce: await owner.getNonce() });
    await sleep(sleepTime);
    console.log('Setting admin whitelist');
    await interludePlatform.connect(owner).setAdminWhitelist(await getContractAddress(adminWhitelist),{ nonce: await owner.getNonce() });
    await sleep(sleepTime);

    console.log("Whitelist contracts deployed");

    //initialize contracts properties
    await initializeCrystals(interludePlatform, owner);
    await initializeGems(interludePlatform, owner);
    await initializePriceSteps(interludePlatform, owner);
    await sleep(sleepTime);
    console.log("Setting special address");
    await token.connect(owner).setSpecialAddress(getContractAddress(interludePlatform),{ nonce: await owner.getNonce() });
    await sleep(sleepTime);
    console.log("Pausing token");
    await token.connect(owner).pause();
    await sleep(sleepTime);
    console.log("Setting start date");
    await interludePlatform.connect(owner).setStartDate(1754883200,{ nonce: await owner.getNonce() });
    await sleep(sleepTime);
    console.log("Setting total sold");
    await interludePlatform.connect(owner).setTotalSold(41825000,{ nonce: await owner.getNonce() });
    
    //await updateEarnings(interludePlatform, owner);
    
    //save adresses
    const dic = {};
    dic.INT_TOKEN_ADDRESS = await getContractAddress(token);
    dic.INTERLUDE_PLATFORM_ADDRESS = await getContractAddress(interludePlatform);
    dic.ADMIN_WHITELIST_ADDRESS = await getContractAddress(adminWhitelist);
    dic.PARTNERS_WHITELIST_ADDRESS = await getContractAddress(partnersWhitelist);
    dic.GENERAL_WHITELIST_ADDRESS = await getContractAddress(generalWhitelist);
    require('fs').writeFileSync('contract_addresses.txt', Object.entries(dic).map(([k, v]) => `${k}=${v}`).join('\n'));
}

async function getContractAddress(contract){
    await contract.waitForDeployment();
    return await contract.getAddress();
}

async function initializeGems(interludePlatform, owner) {
    
    console.log("Initializing gems");

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

    for (const gem of gems) {
        console.log("Initializing" + gem.name);
        await interludePlatform.connect(owner).addAsset(gem.name, gem.power, gem.price, false,{ nonce: await owner.getNonce() });
        await sleep(sleepTime);
    }
  }

async function initializeCrystals(interludePlatform, owner) {

    console.log("Initializing crystals");

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

    for (const crystal of crystals) {
        console.log("Initializing" + crystal.name);
        await interludePlatform.connect(owner).addAsset(crystal.name, crystal.power, crystal.price, true,{ nonce: await owner.getNonce() });
        await sleep(sleepTime);
    }
}

async function initializePriceSteps(interludePlatform, owner) {
    console.log("Initializing price steps");
    const initialPriceEth = 1/400;//1 / 400000000; // Initial price in ETH
    const initialPriceWei = BigInt(Math.floor(initialPriceEth * 10 ** 18)); // Calculate in wei as a string
    
    steps = [];
    
    // Define step sizes and count
    const size = 40000000;
    const totalSteps = 10;
    
    let currentPriceWei = initialPriceWei;

    // Create steps with defined sizes and prices
    for (let i = 0; i < totalSteps; i++) {
        steps.push({ size, price: currentPriceWei.toString() }); // Store price as string for compatibility
        currentPriceWei = currentPriceWei * 2n; // Double the price at each step
    }
    // Call setSteps on the contract with the prepared steps array
    await interludePlatform.connect(owner).setSteps(steps,{ nonce: await owner.getNonce() });
    
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function updateEarnings(interludePlatform, owner){
    
    try {
        // Read the CSV file synchronously
        const data = fs.readFileSync('../InterludeSmartContract/interlude_platform_data_adjusted.csv', 'utf8');
      
        // Split the file into lines
        const lines = data.trim().split('\n');
      
        // Extract the header and rows
        const headers = lines[0].split(',').map(header => header.trim().replace('\r', ''));
        const rows = lines.slice(1);
      
        // Map header indices for relevant columns
        const userIndex = headers.indexOf("User");
        const weightedEarningsIndex = headers.indexOf("WeightedEarnings");
        const totalTokenIndex = headers.indexOf("TotalToken");  // Index for TotalToken
      
        // Check if the required columns exist
        if (userIndex === -1 || weightedEarningsIndex === -1 || totalTokenIndex === -1) {
          console.error("Invalid CSV format. Ensure 'User', 'WeightedEarnings', and 'TotalToken' columns exist.");
          process.exit(1); // Exit with error code
        }
      
        // Iterate through rows to process data
        for (const row of rows) {
          const columns = row.split(',');
          const user = columns[userIndex];
          const weightedEarnings = ethers.parseUnits(columns[weightedEarningsIndex].trim(), 18);
          const totalToken = ethers.parseUnits(columns[totalTokenIndex].trim(), 0);  // Parse TotalToken as uint256
      
          try {
            // Sending transaction for unclaimed earnings
            console.log(`Sending transaction for user: ${user} with weighted earnings: ${weightedEarnings}`);
            // Uncomment the following lines to interact with the blockchain
            const earningsTx = await interludePlatform.connect(owner).giveUnclaimedEarnings(user, weightedEarnings, {
              nonce: await owner.getNonce()
            });
            await earningsTx.wait();
            console.log(`Transaction confirmed for user: ${user}`);
      
            // Sending transaction for total token
            console.log(`Sending transaction for user: ${user} with total token: ${totalToken}`);
            const tokenTx = await interludePlatform.connect(owner).giveTokenTo(user, totalToken, {
              nonce: await owner.getNonce()
            });
            await tokenTx.wait();
            console.log(`Token transaction confirmed for user: ${user}`);
      
          } catch (error) {
            console.error(`Failed to process user ${user}:`, error);
          }
      
          // Sleep to prevent hitting gas limit too quickly
          await sleep(sleepTime);
        }
    
      } catch (error) {
        console.error("Error reading the CSV file or processing data:", error);
      }
}


main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
