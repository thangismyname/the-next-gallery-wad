import { createFriendsService } from "@tng/shared";
import { webHttp } from "@/lib/http.web";

export const {
  fetchFriends,
  fetchFriendRequests,
  searchFriend,
  addFriend,
  fetchSentRequests,
  cancelFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  deleteFriend,
  fetchInviteToken,
  claimInviteToken,
} = createFriendsService(webHttp);
