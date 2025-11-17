"use client";

/**
 * Wallet Connect Button Component
 * Uses Suiet Wallet Kit for Sui blockchain integration
 * Supports Sui Wallet, Suiet, Ethos, and more
 */

import { useWallet, ConnectButton } from "@suiet/wallet-kit";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Wallet, LogOut, Copy, ExternalLink, CheckCircle2 } from "lucide-react";
import { useState } from "react";

export function WalletConnectButton() {
  const {
    connected,
    address,
    disconnect,
    name: walletName,
    chain,
  } = useWallet();

  const [copied, setCopied] = useState(false);

  // Format address for display
  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  // Copy address to clipboard
  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Handle disconnect
  const handleDisconnect = () => {
    disconnect();
  };

  if (connected && address) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="w-full gap-2">
            <Wallet className="h-4 w-4" />
            {formatAddress(address)}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="center" className="w-64">
          <DropdownMenuLabel>
            {walletName || "Sui Wallet"} Connected
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          <div className="px-2 py-2 text-sm">
            <div className="font-medium">Address</div>
            <div className="text-muted-foreground text-xs truncate">
              {address}
            </div>
          </div>

          <div className="px-2 py-2 text-sm">
            <div className="font-medium">Network</div>
            <div className="text-muted-foreground text-xs">
              {chain?.name || "Sui Testnet"}
            </div>
          </div>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={copyAddress}>
            {copied ? (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" />
                Copy Address
              </>
            )}
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() =>
              window.open(
                `https://suiscan.xyz/testnet/account/${address}`,
                "_blank"
              )
            }
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            View on Suiscan
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={handleDisconnect}>
            <LogOut className="mr-2 h-4 w-4" />
            Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // If not connected, use Suiet's built-in ConnectButton with custom styling via CSS
  return <ConnectButton />;
}
