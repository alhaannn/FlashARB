import { describe, it, before } from "node:test";
import assert from "node:assert";
import hre from "hardhat";

const connection = await hre.network.connect();
const { ethers } = connection;

describe("Uniswap V4 and Bidirectional Arbitrage Suite", () => {
  let deployer;
  let unauthorized;
  let executor;
  let mockWeth;

  before(async () => {
    [deployer, unauthorized] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockWeth = await MockERC20.deploy("Wrapped Ether", "WETH", 18);
    await mockWeth.waitForDeployment();

    const FlashArb = await ethers.getContractFactory("FlashArbExecutor");
    executor = await FlashArb.deploy(mockWeth.target);
    await executor.waitForDeployment();
  });

  it("exposes executeV3ToV2FlashArb on ABI and enforces owner-only access", async () => {
    assert.strictEqual(typeof executor.executeV3ToV2FlashArb, "function");

    await assert.rejects(
      async () => {
        await executor.connect(unauthorized).executeV3ToV2FlashArb(
          deployer.address,
          deployer.address,
          1000n,
          true,
          1n,
          0n
        );
      },
      /OwnableUnauthorizedAccount/
    );
  });

  it("exposes executeV4Arbitrage on ABI and enforces owner-only access", async () => {
    assert.strictEqual(typeof executor.executeV4Arbitrage, "function");

    const v4Key = {
      currency0: mockWeth.target,
      currency1: deployer.address,
      fee: 3000,
      tickSpacing: 60,
      hooks: ethers.ZeroAddress
    };

    await assert.rejects(
      async () => {
        await executor.connect(unauthorized).executeV4Arbitrage(
          v4Key,
          1,
          deployer.address,
          v4Key,
          1000n,
          true,
          1n,
          0n
        );
      },
      /OwnableUnauthorizedAccount/
    );
  });

  it("enforces that unlockCallback strictly rejects callers other than poolManager", async () => {
    assert.strictEqual(typeof executor.unlockCallback, "function");

    await assert.rejects(
      async () => {
        await executor.connect(unauthorized).unlockCallback("0x");
      },
      /FlashArb: Unauthorized V4 callback/
    );
  });

  it("allows owner to configure poolManager address", async () => {
    const currentPM = await executor.poolManager();
    assert.strictEqual(ethers.getAddress(currentPM), ethers.getAddress("0x498581fF718922c3f8e6A244956aF099B2652b2b"));

    const newPM = "0x0000000000000000000000000000000000000001";
    await executor.setPoolManager(newPM);
    assert.strictEqual(await executor.poolManager(), newPM);

    // Revert back to canonical
    await executor.setPoolManager(currentPM);
  });
});
