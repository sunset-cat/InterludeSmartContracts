const { expect } = require("chai");


const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");

describe("Token Contract", function () {
  let Token;
  let token;
  let deployer;
  const initialSupply = ethers.parseUnits("1000000000", 18); // 1 billion tokens

  before(async function () {
    
      // Get the deployer account
      [deployer] = await ethers.getSigners();

      // Deploy the token contract
      Token = await ethers.getContractFactory("MyPausableToken");
      token = await Token.deploy("Interlude", "INT", initialSupply);
  });

  it("should have the correct initial supply", async function () {
      const totalSupply = await token.totalSupply();
      expect(totalSupply).to.equal(initialSupply);
  });

  it("should have the deployer owning all the supply", async function () {
      const balance = await token.balanceOf(deployer.address);
      expect(balance).to.equal(initialSupply);
  });
});

describe("InterludePlatform", function () {
    this.timeout(100000);
    let InterludePlatform, interludePlatform, generalWhitelist, token, Token, owner, addr1, addr2, addr3, steps;
    
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

    beforeEach(async function () {
      // Get the ContractFactory and Signers here
      InterludePlatform = await ethers.getContractFactory("InterludePlatform");
      Token = await ethers.getContractFactory("MyPausableToken");
      [owner, addr1, addr2, addr3] = await ethers.getSigners();

      // Deploy the contract
      const initialSupply = ethers.parseUnits("1000000000", 18); 
      // Deploy Token contract
      token = await Token.deploy("Interlude", "INT", initialSupply);
      await token.waitForDeployment();
      
      // Deploy InterludePlatform contract
      interludePlatform = await InterludePlatform.deploy(owner, token.getAddress());
      await interludePlatform.waitForDeployment();
      
      // Set the special address in the Token contract
      await token.connect(owner).setSpecialAddress(interludePlatform.getAddress()); 
      await token.connect(owner).pause();
      
      // Deploy whitelist contracts (assuming they are separate contracts)
      const Whitelist = await ethers.getContractFactory("Whitelist");

      const partnersWhitelist = await Whitelist.deploy();
      await partnersWhitelist.waitForDeployment();
      
      generalWhitelist = await Whitelist.deploy();
      await generalWhitelist.waitForDeployment();
      
      const adminWhitelist = await Whitelist.deploy();
      await adminWhitelist.waitForDeployment();
      
      // Set the whitelist addresses in the InterludePlatform contract
      await interludePlatform.connect(owner).setPartnersWhitelist(partnersWhitelist.getAddress());
      await interludePlatform.connect(owner).setGeneralWhitelist(generalWhitelist.getAddress());
      await interludePlatform.connect(owner).setAdminWhitelist(adminWhitelist.getAddress());

      const balanceAmount = BigInt("0x10000000000000000000000000");
      await setBalance([owner, addr1, addr2, addr3], balanceAmount);

      ownerBalance = await ethers.provider.getBalance(owner.address);

      await initializeCrystals();
      await initializeGems();
      await initializePriceSteps();
      await interludePlatform.connect(owner).setStartDate(0);
      
      await interludePlatform.connect(owner).restrictReferralProgram(true);
    });
    let totalMintedInCrystal = 0n;
    let totalSpentOnCrystal = 1n;

    describe("Deployment", function () {
      it("Should set the right owner", async function () {
        expect(await interludePlatform.owner()).to.equal(owner.address);
        expect(await token.owner()).to.equal(owner.address);
      });

      it("Token should be paused and have the right special address", async function () {
        expect(await token.paused()).to.equal(true);
        await expect(token.connect(addr1).transfer(owner.address, ethers.parseEther("1"))).to.be.reverted;
        expect(await token.specialAddress()).to.equal(await interludePlatform.getAddress());
      });

      it("Should revert when paused if sender is not the special address or the owner", async function () {
        const croAmount = ethers.parseEther("5"); 
        await token.connect(owner).transfer(addr1.address, ethers.parseEther("5"));

        await expect(token.connect(addr1).transfer(owner.address, ethers.parseEther("1"))).to.be.reverted;

      });

      it("Buying token on platform should succeed even with paused contract, but fail if platform is not special address", async function () {
        const croAmount = ethers.parseEther("5"); // Example CRO amount to buy tokens
        await interludePlatform.connect(addr1).buyToken(owner.address, { value: croAmount });
        await token.connect(owner).setSpecialAddress(addr1.address);
        await token.connect(owner).transfer(addr1.address, ethers.parseEther("5"));
        token.connect(addr1).transfer(owner.address, ethers.parseEther("1"))
        await expect(token.connect(addr2).transfer(owner.address, ethers.parseEther("1"))).to.be.reverted;
        await token.connect(owner).setSpecialAddress(await interludePlatform.getAddress());
        await interludePlatform.connect(addr1).buyToken(owner.address, { value: croAmount });
        await token.connect(owner).setSpecialAddress(addr1.address);
        await expect(interludePlatform.connect(addr1).buyToken(owner.address, { value: croAmount })).to.be.reverted;
      });
    });
    
    
    describe("General tests", function () {
      it("Buying token only allowed for whitelisted", async function () {
        expect(await token.paused()).to.equal(true);
        await expect(token.connect(addr1).transfer(owner.address, ethers.parseEther("1"))).to.be.reverted;
        expect(await token.specialAddress()).to.equal(await interludePlatform.getAddress());
      });

      it("should correctly calculate token amount when buying tokens", async function () {
        const croAmount = ethers.parseEther("50000"); // Example CRO amount to buy tokens
        const expectedTokens = calculateTokensToBuy(croAmount.toString(), 0);
        // Execute buyToken function
        await interludePlatform.connect(addr1).buyToken(owner.address, { value: croAmount });
    
        // Get user's token balance from the contract
        const actualTokenBalance = await token.balanceOf(addr1.address);
        const tokenBalanceInUnits = Math.floor(ethers.formatUnits(actualTokenBalance, 18));
        // Assert the actual token balance matches the expected token amount
        expect(tokenBalanceInUnits.toString()).to.equal(expectedTokens.toString());
      });

      it("should correctly calculate token amount and phase when buying tokens at different stages", async function () {
        
        const actualTokenBalance = await token.balanceOf(owner.address);
      
        const testCases = [
          { croAmount: ethers.parseEther("50000") }, // Example amount that should stay within phase 0
          { croAmount: ethers.parseEther("200000") }, // Example amount that moves into phase 1
          { croAmount: ethers.parseEther("450000") }, // Example amount that moves into phase 2
          { croAmount: ethers.parseEther("957000") }, // Example amount that reaches a higher phase
        ];
        let userBalance = BigInt(0);
        for (const { croAmount} of testCases) {
          // Calculate expected tokens to be bought based on the provided CRO amount
          userBalance += calculateTokensToBuy(croAmount.toString(), userBalance);
          // Execute buyToken function
          await interludePlatform.connect(addr1).buyToken(owner.address, { value: croAmount });
      
          // Get user's token balance from the contract
          const actualTokenBalance = await token.balanceOf(addr1.address);
          const isEligible = await interludePlatform.eligibleForReferral(owner.address);
          const tokenBalanceInUnits = Math.floor(ethers.formatUnits(actualTokenBalance, 18));
          // Assert the actual token balance matches the expected token amount
          expect(tokenBalanceInUnits.toString()).to.equal(userBalance.toString());
      
          // Verify if the current phase is as expected
          const actualPhase = await interludePlatform.currentPhase();
          expect(actualPhase).to.equal(getCurrentPhase(userBalance));
        }
      });

      it("Should let the owner add a gem", async function () {
        const gems = await Promise.all([
          interludePlatform.gems(0),
          interludePlatform.gems(1),
          interludePlatform.gems(2),
          interludePlatform.gems(3),
          interludePlatform.gems(4),
          interludePlatform.gems(5),
          interludePlatform.gems(6),
          interludePlatform.gems(7),
        ]);

        expect(gems[0].name).to.equal("Obsidian");
        expect(gems[0].power).to.equal(100);
        expect(gems[0].unscaledPrice).to.equal(5000);

        expect(gems[1].name).to.equal("Carnelian");
        expect(gems[1].power).to.equal(200);
        expect(gems[1].unscaledPrice).to.equal(10000);

        expect(gems[2].name).to.equal("Amethyst");
        expect(gems[2].power).to.equal(420);
        expect(gems[2].unscaledPrice).to.equal(20000);

        expect(gems[3].name).to.equal("Sapphire");
        expect(gems[3].power).to.equal(1050);
        expect(gems[3].unscaledPrice).to.equal(50000);

        expect(gems[4].name).to.equal("Emerald");
        expect(gems[4].power).to.equal(2200);
        expect(gems[4].unscaledPrice).to.equal(100000);

        expect(gems[5].name).to.equal("Ruby");
        expect(gems[5].power).to.equal(4400);
        expect(gems[5].unscaledPrice).to.equal(200000);

        expect(gems[6].name).to.equal("Dragonstone");
        expect(gems[6].power).to.equal(11500);
        expect(gems[6].unscaledPrice).to.equal(500000);

        expect(gems[7].name).to.equal("Moonstone");
        expect(gems[7].power).to.equal(24000);
        expect(gems[7].unscaledPrice).to.equal(1000000);
      });

      it("should correctly calculate token amount, phase, and referral bonuses for two users with referral relationship", async function () {
        const referrerCroBonusPercentage = await interludePlatform.referrerCroBonusPercentage();
        const referrerIntBonusPercentage = await interludePlatform.referrerIntBonusPercentage();
        const referredIntBonusPercentage = await interludePlatform.referredIntBonusPercentage();

      
        const testCases = [
          { buyer: addr2, referralAddress: addr1, croAmount: ethers.parseEther("50000")},
          { buyer: addr2, referralAddress: addr1, croAmount: ethers.parseEther("200000")},
          { buyer: addr1, referralAddress: addr2, croAmount: ethers.parseEther("100000") },
          { buyer: addr1, referralAddress: addr2, croAmount: ethers.parseEther("450000")},
          { buyer: addr1, referralAddress: addr2, croAmount: ethers.parseEther("957000")},
        ];
      
        let addr2Balance = BigInt(0);
        let addr1Balance = BigInt(0);
        let totalSold = BigInt(0);

        let addr1CroReferralBonusAccumulated = BigInt(0);
        let addr1IntReferralBonusAccumulated = BigInt(0);
        let addr2ReferredIntBonusAccumulated = BigInt(0);

        let addr2CroReferralBonusAccumulated = BigInt(0);
        let addr2IntReferralBonusAccumulated = BigInt(0);
        let addr1ReferredIntBonusAccumulated = BigInt(0);
      
        for (const { buyer, referralAddress, croAmount} of testCases) {
          // Calculate expected tokens for current CRO amount
          const tokensToBuy = calculateTokensToBuy(croAmount.toString(), totalSold);
          if (buyer === addr2) {
            addr2Balance += tokensToBuy;
            totalSold += tokensToBuy;
          } else {
            addr1Balance += tokensToBuy;
            totalSold += tokensToBuy;
          }
      
          // Check eligibility for referral bonus before the transaction
          const isEligibleForReferral = await interludePlatform.eligibleForReferral(referralAddress);
          // Execute buyToken function
          await interludePlatform.connect(buyer).buyToken(referralAddress, { value: croAmount });
      
          // Calculate expected referral bonuses if eligible
          const referrerCroBonus = isEligibleForReferral ? (croAmount * BigInt(referrerCroBonusPercentage)) / BigInt(100) : BigInt(0);
          const referrerIntBonus = isEligibleForReferral ? (tokensToBuy * BigInt(referrerIntBonusPercentage)) / BigInt(100) : BigInt(0);
          const referredIntBonus = isEligibleForReferral ? (tokensToBuy * BigInt(referredIntBonusPercentage)) / BigInt(100) : BigInt(0);
          
          // Accumulate referral bonuses for addr1 if eligible
          if (buyer === addr2 && isEligibleForReferral) {
            addr1CroReferralBonusAccumulated += referrerCroBonus;
            addr1IntReferralBonusAccumulated += referrerIntBonus;
            addr2ReferredIntBonusAccumulated += referredIntBonus;
          }else if(buyer === addr1 &&  isEligibleForReferral){
            addr2CroReferralBonusAccumulated += referrerCroBonus;
            addr2IntReferralBonusAccumulated += referrerIntBonus;
            addr1ReferredIntBonusAccumulated += referredIntBonus;
          }
      
          // Assert token balance of buyer
          const actualTokenBalance = await token.balanceOf(buyer.address);
          const expectedBalance = buyer === addr2 ? addr2Balance + addr2ReferredIntBonusAccumulated : addr1Balance + addr1ReferredIntBonusAccumulated;
          expect((actualTokenBalance/BigInt(10**18)).toString()).to.equal(expectedBalance.toString());
      
          // Assert phase progression
          const actualPhase = await interludePlatform.currentPhase();
          expect(actualPhase).to.equal(getCurrentPhase(totalSold));
      
          // Check accumulated CRO referral bonus for addr1
          const actualCroReferralBonus = await interludePlatform.unclaimedCroReferralBonus(addr1.address);
          expect(actualCroReferralBonus.toString()).to.equal(addr1CroReferralBonusAccumulated.toString());
      
          // Check accumulated INT referral bonus for addr1
          const actualIntReferralBonus = await interludePlatform.unclaimedIntReferralBonus(addr1.address);
          expect(actualIntReferralBonus.toString()).to.equal(addr1IntReferralBonusAccumulated.toString());
      
          // Check accumulated INT bonus for referred user (addr2)
          const actualReferredIntBonus = await interludePlatform.spendableTokens(addr2.address);
          expect(actualReferredIntBonus.toString()).to.equal((addr2Balance + addr2ReferredIntBonusAccumulated).toString());
        }
      });

      it("should correctly track user earnings, with non null dilution", async function () {
        const userPower = {
          [owner.address]: { gemPower: 0n, crystalPower: 0n, mintedCrystal: 0n},
          [addr1.address]: { gemPower: 0n, crystalPower: 0n, mintedCrystal: 0n},
          [addr2.address]: { gemPower: 0n, crystalPower: 0n, mintedCrystal: 0n}
        };
        const userEarnings = {
          [owner.address]: { totalEarnings: 0n },
          [addr1.address]: { totalEarnings: 0n },
          [addr2.address]: { totalEarnings: 0n }
        };
  
        userPower.totalIntInGems = 1n;
        userPower.totalIntInCrystals = 1n;
        userPower.totalCrystalPriceUnits = 1n;
  
        let accumulatedCro = BigInt(0);
  
        // Buy initial tokens for each user
        const buyTokenAmount = ethers.parseEther("200000");
        const tx = await interludePlatform.connect(owner).buyToken(owner.address, { value: buyTokenAmount });
        await interludePlatform.connect(addr1).buyToken(addr1.address, { value: buyTokenAmount });
        await interludePlatform.connect(addr2).buyToken(addr2.address, { value: buyTokenAmount });
        accumulatedCro += buyTokenAmount * 3n / 2n;

        // Initial transactions to populate power
        for (let i = 0; i < 10; i++) {
            await buyAsset(owner, userPower);
            await buyAsset(addr1, userPower);
            await buyAsset(addr2, userPower);
        }
        //simulation of transactions to trigger earnings
        for (let j = 0; j < rand(1,10); j++) {
          for (let i = 0; i < rand(1,10); i++) {
            const randomCroAmount = BigInt(Math.floor((Math.random() * (2000 - 100) + 100)))
            await buyTokens(addr3, ethers.parseEther(randomCroAmount.toString()));
            accumulatedCro += ethers.parseEther(randomCroAmount.toString())/2n;
          }
          for (const user of [owner, addr1, addr2]) {
            await interludePlatform.connect(user).buyGem(0, 1);
            userPower[user.address].gemPower += BigInt(100);
            userPower.totalIntInGems += BigInt(5000);
          }
          for (let i = 0; i < rand(1,20); i++) {
            
            if(Math.random() < 0.5){
              await sellAsset(owner, userPower);
            }
            if(Math.random() < 0.5){
              await sellAsset(addr1, userPower);
            }
            if(Math.random() < 0.5){
              await sellAsset(addr2, userPower);
            }
  
            if(Math.random() < 0.5){
              await buyAsset(owner, userPower);
            }
            if(Math.random() < 0.5){
              await buyAsset(addr1, userPower);
            }
            if(Math.random() < 0.5){
              await buyAsset(addr2, userPower);
            }
  
            if(Math.random() < 0.5){
              await mintCrystal(owner, userPower);
              await mintCrystal(owner, userPower);
              await mintCrystal(owner, userPower);
              await mintCrystal(owner, userPower);
              await mintCrystal(owner, userPower);
              await mintCrystal(owner, userPower);
            }
            if(Math.random() < 0.5){
              await mintCrystal(addr1, userPower);
              await mintCrystal(addr1, userPower);
              await mintCrystal(addr1, userPower);
              await mintCrystal(addr1, userPower);
              await mintCrystal(addr1, userPower);
              await mintCrystal(addr1, userPower);
            }
            if(Math.random() < 0.5){
              await mintCrystal(addr2, userPower);
              await mintCrystal(addr2, userPower);
              await mintCrystal(addr2, userPower);
              await mintCrystal(addr2, userPower);
              await mintCrystal(addr2, userPower);
              await mintCrystal(addr2, userPower);
            }
          }
  
          //check accumulated earnings match
          let contractAccumulatedCro = await interludePlatform.accumulatedCro();
          expect(contractAccumulatedCro.toString()).to.equal(accumulatedCro.toString());
  
          //do earning update on the contract
          await updateEarnings();
  
          //compute earnings locally
          let totalDistributed = 0n;
          for (const user of [owner, addr1, addr2]) {
            totalDistributed += await updateUserEarningsLocal(user, accumulatedCro, userEarnings, userPower);
          }
          accumulatedCro -= totalDistributed;

          //check all values match
          for (const user of [owner, addr1, addr2]) {
            const contractGemPower = await interludePlatform.currentGemPower(user.address);
            const contractCrystalPower = await interludePlatform.currentCrystalPower(user.address);
            console.log(contractGemPower,contractCrystalPower, userPower[user.address].gemPower,userPower[user.address].crystalPower)
            expect(contractGemPower.toString()).to.equal(userPower[user.address].gemPower.toString());
            expect(contractCrystalPower.toString()).to.equal(userPower[user.address].crystalPower.toString());
  
            const expectedEarnings = userEarnings[user.address].totalEarnings;
            const actualEarnings = await interludePlatform.unclaimedEarnings(user.address);

            expect(actualEarnings.toString()).to.equal(expectedEarnings.toString());
          }
        }
      });

      it("should correctly track user earnings for n users, with non null dilution", async function () {
        const userPower = {};
        const userEarnings = {};
        const userAddresses = [];
        let accumulatedCro = BigInt(0);
      
         // Dynamically create n impersonated signers
        for (let i = 0; i < 100; i++) {
          const randomAddress = ethers.Wallet.createRandom().address;
          const signer = await ethers.getImpersonatedSigner(randomAddress); // Impersonate the address
          userAddresses.push(signer);
          userPower[signer.address] = { gemPower: 0n, crystalPower: 0n, mintedCrystal: 0n };
          userEarnings[signer.address] = { totalEarnings: 0n };

          // Fund the impersonated signer with ETH (required for transactions)
          await ethers.provider.send("hardhat_setBalance", [
            randomAddress,
            ethers.toQuantity(ethers.parseEther("100000")), // 100 ETH for gas and transactions
          ]);
        }
      
        userPower.totalIntInGems = 1n;
        userPower.totalIntInCrystals = 1n;
        userPower.totalCrystalPriceUnits = 1n;
      
        // Buy initial tokens for each user
        const buyTokenAmount = ethers.parseEther("2000");
        for (const user of userAddresses) {
          await interludePlatform.connect(user).buyToken(user.address, { value: buyTokenAmount });
        }
        accumulatedCro += (buyTokenAmount * BigInt(userAddresses.length)) / 2n;
      
        // Initial transactions to populate power
        for (let i = 0; i < 10; i++) {
          for (const user of userAddresses) {
            await buyAsset(user, userPower);
          }
        }
      
        // Simulation of transactions to trigger earnings
        for (let j = 0; j < rand(1, 10); j++) {
          for (let i = 0; i < rand(1, 10); i++) {
            const randomCroAmount = BigInt(Math.floor(Math.random() * (2000 - 100) + 100));
            await buyTokens(addr3, ethers.parseEther(randomCroAmount.toString()));
            accumulatedCro += ethers.parseEther(randomCroAmount.toString()) / 2n;
          }
      
          for (let i = 0; i < rand(1, 20); i++) {
            for (const user of userAddresses) {
              if (Math.random() < 0.5) {
                await sellAsset(user, userPower);
              }
              if (Math.random() < 0.5) {
                await buyAsset(user, userPower);
              }
              if (Math.random() < 0.5) {
                for (let k = 0; k < 6; k++) {
                  await mintCrystal(user, userPower);
                }
              }
            }
          }
      
          // Check accumulated earnings match
          const contractAccumulatedCro = await interludePlatform.accumulatedCro();
          expect(contractAccumulatedCro.toString()).to.equal(accumulatedCro.toString());
      
          // Update earnings on the contract
          await updateEarnings();
      
          // Compute earnings locally
          let totalDistributed = 0n;
          for (const user of userAddresses) {
            totalDistributed += await updateUserEarningsLocal(user, accumulatedCro, userEarnings, userPower);
          }
          accumulatedCro -= totalDistributed;
      
          // Check all values match
          for (const user of userAddresses) {
            const contractGemPower = await interludePlatform.currentGemPower(user.address);
            const contractCrystalPower = await interludePlatform.currentCrystalPower(user.address);
            expect(contractGemPower.toString()).to.equal(userPower[user.address].gemPower.toString());
            expect(contractCrystalPower.toString()).to.equal(userPower[user.address].crystalPower.toString());
      
            const expectedEarnings = userEarnings[user.address].totalEarnings;
            const actualEarnings = await interludePlatform.unclaimedEarnings(user.address);
            expect(actualEarnings.toString()).to.equal(expectedEarnings.toString());
          }
        }
      });
    });

    function calculateTotalPowers(userPower) {
      let totalGemPower = 1n;     
      let totalCrystalPower = 1n; 
      
      for (const user of Object.values(userPower)) {
        if(user.gemPower === undefined) continue;
        totalGemPower += user.gemPower;  
        totalCrystalPower += user.crystalPower;
      }
      return { totalGemPower, totalCrystalPower }; 
    }

    async function updateEarnings() {
      // Initialize earnings update and track gas cost
      let tx = await interludePlatform.connect(owner).initializeUsersEarningsUpdate();
      let receipt = await tx.wait();
      let gasUsed = receipt.gasUsed; // BigNumber
      let effectiveGasPrice = ethers.parseUnits("5000", "gwei");
      let gasCost = gasUsed * effectiveGasPrice; // Multiply BigNumber values
      console.log(`Gas cost for initializeUsersEarningsUpdate: ${ethers.formatEther(gasCost)} ETH`);
      console.log(`Gas used for initializeUsersEarningsUpdate:`, gasUsed);
  
      // Update earnings while distribution is in progress
      while (await interludePlatform.connect(owner).distributionInProgress()) {
          tx = await interludePlatform.connect(owner).updateAllUsersEarnings();
          receipt = await tx.wait();
          gasUsed = receipt.gasUsed; // BigNumber
          gasCost = gasUsed * effectiveGasPrice; // Multiply BigNumber values
          console.log(`Gas cost for updateAllUsersEarnings: ${ethers.formatEther(gasCost)} ETH`);
          console.log(`Gas used for initializeUsersEarningsUpdate:`, gasUsed);
      }
  } 

    function rand(i,j){
      const t=  Math.floor(Math.random() * (j-i)) + i
      return t
    }

    async function updateUserEarningsLocal(user, amount, userEarnings, userPower){
      const croToRedistribute = amount;
      const totals = calculateTotalPowers(userPower);
      const contractGemPower = await interludePlatform.totalGemPower();
      const contractCrystalPower = await interludePlatform.totalCrystalPower();

      expect(contractGemPower.toString()).to.equal(totals.totalGemPower.toString());
      expect(contractCrystalPower.toString()).to.equal(totals.totalCrystalPower.toString());

      const intInGemsContract = await interludePlatform.totalIntInGems();
      const intInCrystalsContract = await interludePlatform.totalIntInCrystals();

      expect(intInGemsContract.toString()).to.equal(userPower.totalIntInGems.toString());
      expect(intInCrystalsContract.toString()).to.equal(userPower.totalIntInCrystals.toString());
      const gemCoef = 1000000n * userPower.totalIntInGems / (userPower.totalIntInCrystals + userPower.totalIntInGems);
      const crystalCoef = 1000000n * userPower.totalIntInCrystals / (userPower.totalIntInCrystals + userPower.totalIntInGems);
      
      const newEarnings = 
          (croToRedistribute * 
            (gemCoef * userPower[user.address].gemPower / totals.totalGemPower 
              + crystalCoef * userPower[user.address].crystalPower / totals.totalCrystalPower)) 
          / 1000000n;


      userEarnings[user.address].totalEarnings += newEarnings;
              
      return newEarnings;
    }

    async function DisplayGasCost(txResponse){
      const txReceipt = await txResponse.wait();

      // Get the gas used from the receipt
      const gasUsed = txReceipt.gasUsed;
    }

    async function getTotalEarnings(address){
      const acc = await interludePlatform.calculateAccumulatedEarnings(address);
      const unclaimed =  await interludePlatform.unclaimedEarnings(address)
      return acc + unclaimed;
    }
    // Helper function to execute a random buy or sell and track power locally
    async function buyAsset(user, userPower) {
        const itemType = Math.random() < 0.5 ? "gem" : "crystal";
        const item = itemType === "gem" ? getRandomItem(gems) : getRandomItem(crystals);
        const itemAmount = Math.floor(Math.random() * 5) + 1;
        const itemCost = BigInt(item.price * itemAmount);
        const scaledItemCost = itemType === "gem" ? itemCost : userPower.totalIntInCrystals * itemCost / userPower.totalCrystalPriceUnits;
        const itemPower = item.power * itemAmount;
        
        if ((await interludePlatform.spendableTokens(user.address)) >= scaledItemCost) {
            if (itemType === "gem") {
                await interludePlatform.connect(user).buyGem(gems.indexOf(item), itemAmount);
                userPower[user.address].gemPower += BigInt(itemPower);
                userPower.totalIntInGems += scaledItemCost;
            } else {
                await interludePlatform.connect(user).buyCrystal(crystals.indexOf(item), itemAmount);
                userPower[user.address].crystalPower += BigInt(itemPower);
                userPower.totalIntInCrystals += scaledItemCost;
                userPower.totalCrystalPriceUnits += itemCost;
            }
        } 

        // Verify local power matches contract state
        const contractGemPower = await interludePlatform.currentGemPower(user.address);
        const contractCrystalPower = await interludePlatform.currentCrystalPower(user.address);
        expect(contractGemPower.toString()).to.equal(userPower[user.address].gemPower.toString());
        expect(contractCrystalPower.toString()).to.equal(userPower[user.address].crystalPower.toString());
    }

    async function sellAsset(user, userPower) {
      const itemType = Math.random() < 0.5 ? "gem" : "crystal";
      const item = itemType === "gem" ? getRandomItem(gems) : getRandomItem(crystals);
      const itemAmount = Math.floor(Math.random() * 5) + 1;
      const itemCost = BigInt(item.price * itemAmount);
      const scaledItemCost = itemType === "gem" ? itemCost : userPower.totalIntInCrystals * itemCost / userPower.totalCrystalPriceUnits;
      const itemPower = item.power * itemAmount;
      if (itemType === "gem" && await getGemQuantity(gems.indexOf(item), user) >= itemAmount) {
          await interludePlatform.connect(user).sellGem(gems.indexOf(item), itemAmount);
          userPower[user.address].gemPower -= BigInt(itemPower);
          userPower.totalIntInGems -= scaledItemCost;
      } else if(itemType === "crystal" && await getCrystalQuantity(crystals.indexOf(item), user) >= itemAmount) {
          await interludePlatform.connect(user).sellCrystal(crystals.indexOf(item), itemAmount);
          userPower[user.address].crystalPower -= BigInt(itemPower);
          userPower.totalIntInCrystals -= scaledItemCost;
          userPower.totalCrystalPriceUnits -= itemCost;
      }

      // Verify local power matches contract state
      const contractGemPower = await interludePlatform.currentGemPower(user.address);
      const contractCrystalPower = await interludePlatform.currentCrystalPower(user.address);
      expect(contractGemPower.toString()).to.equal(userPower[user.address].gemPower.toString());
      expect(contractCrystalPower.toString()).to.equal(userPower[user.address].crystalPower.toString());
  }

    // Helper function to execute a random buy or sell and track power locally
    async function mintCrystal(user, userPower) {
      const item = getRandomItem(crystals);
      const itemAmount = Math.floor(Math.random() * 5) + 1;
      const itemCost = BigInt(item.price * itemAmount);
      const itemPower = item.power * itemAmount;

      
      await interludePlatform.connect(owner).mintCrystal(user, crystals.indexOf(item), itemAmount);
      userPower[user.address].crystalPower += BigInt(itemPower);  
      userPower.totalCrystalPriceUnits += itemCost;

      // Verify local power matches contract state
      const contractCrystalPower = await interludePlatform.currentCrystalPower(user.address);

      expect(contractCrystalPower.toString()).to.equal(userPower[user.address].crystalPower.toString());
    }

      // Helper function to pick a random gem or crystal
    function getRandomItem(items) {
        return items[Math.floor(Math.random() * items.length)];
    }

    function calculateDilutionFactor() {
      return 1000000n * totalSpentOnCrystal / (totalMintedInCrystal + totalSpentOnCrystal);
    }

    async function initializeGems() {
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
          await interludePlatform.connect(owner).addAsset(gem.name, gem.power, gem.price, false);
      }
    }
  
    async function initializeCrystals() {
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
            await interludePlatform.connect(owner).addAsset(crystal.name, crystal.power, crystal.price, true);
        }
    }

    function calculateTokensToBuy(croAmount, totalSold) {
      let tokensToBuy = 0n;
      let croRemaining = BigInt(croAmount);
      let cumulativeTokensSold = BigInt(totalSold); // Track cumulative tokens sold
  
      for (const step of steps) {
          if (croRemaining <= 0n) break;
  
          const size = BigInt(step.size);
          const price = BigInt(step.price);
  
          // Calculate cumulative tokens available up to this step
          const cumulativeStepTokens = steps.slice(0, steps.indexOf(step) + 1)
              .reduce((acc, curr) => acc + BigInt(curr.size), 0n);
  
          // Calculate available tokens in the current step
          const availableTokensInStep = cumulativeStepTokens > cumulativeTokensSold
              ? cumulativeStepTokens - cumulativeTokensSold
              : 0n;
  
          // If no available tokens in this step, continue to the next step
          if (availableTokensInStep <= 0n) continue;
  
          // Calculate the CRO needed to buy all available tokens at the current step price
          const croNeededForStep = availableTokensInStep * price;
  
          if (croRemaining >= croNeededForStep) {
              // Buy all available tokens in the step
              tokensToBuy += availableTokensInStep;
              croRemaining -= croNeededForStep;
              cumulativeTokensSold += availableTokensInStep;
          } else {
              // Buy as many tokens as possible with the remaining CRO
              tokensToBuy += croRemaining / price;
              croRemaining = 0n; // No CRO remaining
          }
      }
  
      return tokensToBuy;
    }

    async function initializePriceSteps() {
      const initialPriceEth = 1 / 400; // Initial price in ETH
      const initialPriceWei = ethers.parseEther(initialPriceEth.toString()); // Convert initial price to wei
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
      await interludePlatform.connect(owner).setSteps(steps);
    }

    function getCurrentPhase(totalSold) {
      let cumulativeTokens = 0;
    
      for (let i = 0; i < steps.length; i++) {
        cumulativeTokens += steps[i].size;
    
        if (totalSold < cumulativeTokens) {
          return Number(i) + 1;
        }
      }
    
      // If totalSold exceeds the total tokens in all steps, return the last step index
      return Number(steps.length - 1) + 1;
    }

    async function setBalance(accounts, balance) {
      const balanceHex = `0x${balance.toString(16)}`;
      for (const account of accounts) {
          await network.provider.send("hardhat_setBalance", [
              account.address,
              balanceHex,
          ]);
      }
    }

    async function buyTokens(user, randomEthAmount) {
            // Limit to 4 decimal places for readability
  
          await interludePlatform.connect(user).buyToken(user.address, { value: randomEthAmount });
    }

    async function getGemQuantity(index, user) {
      try {
        const result = await interludePlatform.connect(owner).getGems(user.address);
        return result[index]; // Returns an array of objects with gem index and quantity
      } catch (e) {
        return [];
      }
    }

    async function getCrystalQuantity(index, user) {
      try {
        const result = await interludePlatform.connect(owner).getCrystals(user.address);
        return result[index]; // Returns an array of objects with gem index and quantity
      } catch (e) {
        return [];
      }
    }

    async function getGems(user) {
      try {
        const result = await interludePlatform.connect(owner).getGems(user.address);
        return result
        
      } catch (e) {
        console.log(e);
        return [];
      }
    }

    async function getCrystals(user) {
      try {
        const result = await interludePlatform.connect(owner).getCrystals(user.address);
        return result
        
      } catch (e) {
        console.log(e);
        return [];
      }
    }
  });
