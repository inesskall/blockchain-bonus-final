const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying TrainingSpotAuction with account:", deployer.address);
  console.log("Network:", hre.network.name);

  const TrainingSpotAuction = await hre.ethers.getContractFactory("TrainingSpotAuction");
  const auction = await TrainingSpotAuction.deploy(deployer.address);
  await auction.waitForDeployment();

  const contractAddress = await auction.getAddress();
  console.log("TrainingSpotAuction deployed to:", contractAddress);

  const latestBlock = await hre.ethers.provider.getBlock("latest");
  const baseTime = latestBlock.timestamp;

  const trainingSpots = [
    {
      coachName: "Serena Williams",
      trainingDateTime: baseTime + 7 * 24 * 60 * 60,
      description: "Exclusive private tennis training session for one winner.",
      location: "Almaty Premium Gym Court A",
      image: "https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?q=80&w=1200&auto=format&fit=crop"
    },
    {
      coachName: "Cristiano Ronaldo",
      trainingDateTime: baseTime + 10 * 24 * 60 * 60,
      description: "Premium football performance and conditioning session.",
      location: "Astana Elite Sports Arena",
      image: "https://images.unsplash.com/photo-1575361204480-aadea25e6e68?q=80&w=1200&auto=format&fit=crop"
    },
    {
      coachName: "Khabib Nurmagomedov",
      trainingDateTime: baseTime + 14 * 24 * 60 * 60,
      description: "Exclusive grappling and endurance masterclass.",
      location: "Almaty Combat Training Center",
      image: "https://images.unsplash.com/photo-1599058917212-d750089bc07e?q=80&w=1200&auto=format&fit=crop"
    }
  ];

  for (const spot of trainingSpots) {
    const tx = await auction.mintTrainingSpot(
      spot.coachName,
      spot.trainingDateTime,
      spot.description,
      spot.location,
      spot.image
    );
    const receipt = await tx.wait();
    console.log(`Minted training spot in tx: ${receipt.hash}`);
  }

  const artifact = await hre.artifacts.readArtifact("TrainingSpotAuction");

  const frontendAbiPath = path.join(__dirname, "..", "frontend", "src", "abi", "TrainingSpotAuction.json");
  const frontendConfigPath = path.join(__dirname, "..", "frontend", "src", "config", "contract.json");

  fs.mkdirSync(path.dirname(frontendAbiPath), { recursive: true });
  fs.mkdirSync(path.dirname(frontendConfigPath), { recursive: true });

  fs.writeFileSync(frontendAbiPath, JSON.stringify(artifact.abi, null, 2));
  fs.writeFileSync(
    frontendConfigPath,
    JSON.stringify(
      {
        address: contractAddress,
        network: hre.network.name,
        chainId: hre.network.name === "sepolia" ? 11155111 : 31337
      },
      null,
      2
    )
  );

  console.log("Frontend ABI and contract config updated.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
