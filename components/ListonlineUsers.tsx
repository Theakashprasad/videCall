"use client";
import { useSocket } from "@/context/SocketContext";
import { useUser } from "@clerk/nextjs";
import Avatar from "./Avatar";

const ListonlineUsers = () => {
  const { user } = useUser();
  const { onlineUsers, handleCall } = useSocket();

  return (
    <div className="flex border-b border-b-primary/10 w-full items-center pb-2">
      {onlineUsers &&
        onlineUsers.map((onlineuser) => {
          if (onlineuser.profile.id === user?.id) return null;
          return (
            <div
              key={onlineuser.userId}
              onClick={() => handleCall(onlineuser)}
              className="flex flex-col items-center gap-1 cursor-pointer"
            >
              <Avatar src={onlineuser.profile.imageUrl} />
              <div className="text-sm">
                {onlineuser.profile.fullName?.split(" ")[0]}
              </div>
            </div>
          );
        })}
    </div>
  );
};

export default ListonlineUsers;
