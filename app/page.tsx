import CallNotification from "@/components/CallNotification";
import ListonlineUsers from "@/components/ListonlineUsers";
import VideoCall from "@/components/VideoCall";

export default function Home() {
  return (
    <div>
      <ListonlineUsers />
      <CallNotification />
      <VideoCall />
    </div>
  );
}
