import { rpc } from "./db";

/**
 * Points granted once, when someone joins a group. Enforced as one allocation
 * per person per group by a partial unique index, so a rejoin cannot mint more.
 */
export const STARTING_POINTS = 1000;

export function getBalance(groupId: string, userId: string): Promise<number> {
  return rpc<number>("points_balance", {
    p_group_id: groupId,
    p_user_id: userId,
  });
}
