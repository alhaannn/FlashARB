#!/usr/bin/env bash
# ==============================================================================
# FlashArb PRO - 1-Click Cloud VPS Automated Setup Script (Ubuntu 22.04 / 24.04)
# Co-located in AWS us-east-1 (North Virginia) for 1-2ms Sequencer Latency
# ==============================================================================

set -e

echo "========================================================="
echo "   🚀 FlashArb PRO - Automated Cloud Co-location Setup   "
echo "========================================================="

# 1. Configure Swap Memory (CRITICAL for AWS Free Tier 1GB RAM to run butter smooth)
echo -e "\n[1/6] Configuring 4 GB Swap memory for zero-lag performance..."
if [ $(swapon --show | wc -l) -le 1 ]; then
    sudo fallocate -l 4G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=4096
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    sudo sysctl vm.swappiness=10
    sudo sysctl vm.vfs_cache_pressure=50
    echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
    echo 'vm.vfs_cache_pressure=50' | sudo tee -a /etc/sysctl.conf
    echo "  ✅ 4 GB Swap active! Total virtual memory now: ~5 GB."
else
    echo "  ℹ️ Swap is already configured. Skipping."
fi

# 2. Update system packages
echo -e "\n[2/6] Updating operating system packages..."
sudo apt update -y && sudo apt upgrade -y

# 3. Install Node.js (v20 LTS), Git, and Build Tools
echo -e "\n[3/6] Installing Node.js LTS and dependencies..."
sudo apt install -y curl git build-essential ufw htop

if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
fi

echo "  Node.js version: $(node -v)"
echo "  NPM version:     $(npm -v)"

# 4. Install PM2 (Process Manager to run bot 24/7 in background)
echo -e "\n[4/6] Installing PM2 process manager..."
sudo npm install -g pm2

# 5. Install Project Dependencies & Compile Contracts
echo -e "\n[5/6] Installing project dependencies and compiling contracts..."
npm install
npx hardhat compile

# 6. Configure Firewall (Allow SSH & Web App Port 3000)
echo -e "\n[6/6] Configuring firewall rules..."
sudo ufw allow OpenSSH || true
sudo ufw allow 3000/tcp || true
sudo ufw --force enable || true

echo -e "\n========================================================="
echo "   ✅ Setup Complete! Starting FlashArb 24/7 Autopilot...  "
echo "========================================================="

# Start or restart bot with PM2
pm2 stop flasharb || true
pm2 start server.js --name "flasharb"
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp $HOME || true

PUBLIC_IP=$(curl -s ifconfig.me || echo "YOUR_VPS_IP")

echo ""
echo "🌐 Web Dashboard is now LIVE 24/7 at:"
echo "   http://${PUBLIC_IP}:3000"
echo ""
echo "To view live logs on the server anytime, run:"
echo "   pm2 logs flasharb"
echo "========================================================="
