// ============================================================================
// Example crisis prompts for the input box.
//
// These are only suggested *inputs* a user can click — not scenario data. The
// world (nodes, populations, agents) is designed at run time by Claude from the
// chosen prompt plus live CISA threat intelligence. Nothing here is simulated
// state; it's just starter text.
// ============================================================================

export interface PromptExample {
  id: string;
  title: string;
  prompt: string;
}

export const PROMPT_EXAMPLES: PromptExample[] = [
  {
    id: "power-grid",
    title: "Power grid + ransomware",
    prompt:
      "Bay Area power grid. An earthquake just hit and three substations are offline. One substation node is under active ransomware. Roughly 200,000 residents lose power in 60 seconds if nothing changes, and a hospital is on the network.",
  },
  {
    id: "water-treatment",
    title: "Water treatment attack",
    prompt:
      "City water treatment plant. The dosing PLC was hijacked to alter chlorine setpoints and a reservoir went offline. Safe water to about 90,000 people — including a dialysis center — is at risk in 75 seconds.",
  },
  {
    id: "av-fleet",
    title: "Autonomous fleet failure",
    prompt:
      "Autonomous vehicle fleet. Correlated LiDAR sensor dropout is cascading across one zone during peak load while another zone is offline. 44,000 riders are stranded and a hospital transport corridor is at risk in 60 seconds.",
  },
  {
    id: "hospital-network",
    title: "Hospital network outage",
    prompt:
      "Hospital network. Ransomware is spreading from the imaging VLAN toward the life-support segment while imaging and pharmacy networks are down. The ICU segment must stay protected in 70 seconds.",
  },
];
