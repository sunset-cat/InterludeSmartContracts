require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.27",
  networks: {
    polygon: {
      url: "https://polygon-mainnet.infura.io/v3/4fecf179182b4b73a8f558433a4f6c8a",
      accounts: [`406f3b565cb6d0ccb0e5ad78d0d907c5622637e3cf796e799ddbf1a05f76b06e`]
    },
    cronos: {
      url: "https://cronos-evm-rpc.publicnode.com",
      chainId: 25,
      accounts: [`406f3b565cb6d0ccb0e5ad78d0d907c5622637e3cf796e799ddbf1a05f76b06e`]
    }
  },
};
