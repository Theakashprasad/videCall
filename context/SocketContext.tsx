import { OngoingCall, Participants, PeerData, SocketUser } from "@/types";
import { useUser } from "@clerk/nextjs";
import Peer, { SignalData } from "simple-peer";
import { DefaultEventsMap } from "socket.io/dist/typed-events";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { Socket } from "socket.io";
import { io } from "socket.io-client";

interface iSocketContext {
  onlineUsers: SocketUser[] | null;
  ongoingCall: OngoingCall | null;
  localStream: MediaStream | null;
  peer: PeerData | null;
  isCallEnded: boolean;
  handleCall: (user: SocketUser) => void;
  handleJoinCall: (ongoingCall: OngoingCall) => void;
  handleHangup: (data: {
    ongoingCall?: OngoingCall;
    isEmitHangup?: boolean;
  }) => void;
}

export const SocketContext = createContext<iSocketContext | null>(null);

export const SocketContextProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { user } = useUser();
  const [socket, setSocket] = useState<Socket<
    DefaultEventsMap,
    DefaultEventsMap
  > | null>(null);
  const [isSocketConnected, setSocketConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<SocketUser[] | null>(null);
  const [ongoingCall, setOnGoingCall] = useState<OngoingCall | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peer, setPeer] = useState<PeerData | null>(null);
  const [isCallEnded, setIsCallEnded] = useState(false);

  const currentSocketUser = onlineUsers?.find(
    (onlineUser) => onlineUser.userId === user?.id
  );

  const getMediaStreams = useCallback(
    async (faceMode: string) => {
      if (localStream) {
        return localStream;
      }
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(
          (device) => device.kind === "videoinput"
        );
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: {
            width: { min: 640, ideal: 1280, max: 1920 },
            height: { min: 360, ideal: 720, max: 1080 },
            frameRate: { min: 16, ideal: 30, max: 30 },
            facingMode: videoDevices.length > 0 ? faceMode : undefined,
          },
        });

        setLocalStream(stream);
        return stream;
      } catch (error) {
        console.log("Failed to get the stream", error);
        setLocalStream(null);
        return null;
      }
    },
    [localStream]
  );

  const handleCall = useCallback(
    async (user: SocketUser) => {
      setIsCallEnded(false);

      if (!currentSocketUser || !socket) return;
      const stream = await getMediaStreams("user");
      if (!stream) {
        console.log("no stream in handleCall");

        return;
      }
      const partcipants = { caller: currentSocketUser, receiver: user };
      setOnGoingCall({ partcipants, isRinging: false });
      socket.emit("call", partcipants);
    },
    [socket, currentSocketUser, ongoingCall]
  );

  const onIncomingCall = useCallback(
    (partcipants: Participants) => {
      setOnGoingCall({ partcipants, isRinging: true });
    },
    [socket, user, ongoingCall]
  );

  const handleHangup = useCallback(
    (data: { ongoingCall?: OngoingCall | null; isEmitHangup?: boolean }) => {
      if (socket && user && data?.ongoingCall && data?.isEmitHangup) {
        socket.emit("hangup", {
          ongoingCall: data.ongoingCall,
          userHangingupId: user.id,
        });
      }
      setOnGoingCall(null);
      setPeer(null);
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
        setLocalStream(null);
      }
      setIsCallEnded(true);
    },
    [socket, user, localStream]
  );
  const createPeer = useCallback(
    (stream: MediaStream, initiator: boolean) => {
      const iceServers: RTCIceServer[] = [
        {
          urls: [
            "stun:stun.l.google.com:19302",
            "stun:stun1.l.google.com:19302",
            "stun:stun2.l.google.com:19302",
            "stun:stun3.l.google.com:19302",
          ],
        },
      ];
      const peer = new Peer({
        stream,
        initiator,
        trickle: true,
        config: { iceServers },
      });
      peer.on("stream", (stream) => {
        setPeer((prevPeer) => {
          if (prevPeer) {
            return { ...prevPeer, stream };
          }
          return prevPeer;
        });
      });
      peer.on("error", console.error);
      peer.on("close", () => handleHangup({}));

      const rtcPeerConnection: RTCPeerConnection = (peer as any)._pc;
      rtcPeerConnection.oniceconnectionstatechange = async () => {
        if (
          rtcPeerConnection.iceConnectionState === "disconnected" ||
          rtcPeerConnection.iceConnectionState === "failed"
        ) {
          handleHangup({});
        }
      };

      return peer;
    },
    [ongoingCall, setPeer]
  );

  const completePeerConnection = useCallback(
    async (connectionData: {
      sdp: SignalData;
      ongoingCall: OngoingCall;
      isCaller: boolean;
    }) => {
      if (!localStream) {
        console.log("Missing the localStream");
        return;
      }
      if (peer) {
        peer.peerConnection?.signal(connectionData.sdp);
        return;
      }

      const newPeer = createPeer(localStream, true);
      setPeer({
        peerConnection: newPeer,
        partcipantUser: connectionData.ongoingCall.partcipants.receiver,
        stream: undefined,
      });

      newPeer.on("signal", async (data: SignalData) => {
        if (socket) {
          socket.emit("webrtcSignal", {
            sdp: data,
            ongoingCall,
            isCaller: true,
          });
        }
      });
    },
    [localStream, createPeer, peer, ongoingCall]
  );

  const handleJoinCall = useCallback(
    async (ongoingCall: OngoingCall) => {
      //joining call
      console.log(ongoingCall);
      setIsCallEnded(false);
      setOnGoingCall((prev) => {
        if (prev) {
          return { ...prev, isRinging: false };
        } else {
          return prev;
        }
      });
      const stream = await getMediaStreams("user");
      if (!stream) {
        console.log("could not stream");
        handleHangup({
          ongoingCall: ongoingCall ? ongoingCall : undefined,
          isEmitHangup: true,
        });
        return;
      }
      const newPeer = createPeer(stream, true);
      setPeer({
        peerConnection: newPeer,
        partcipantUser: ongoingCall.partcipants.caller,
        stream: undefined,
      });

      newPeer.on("signal", async (data: SignalData) => {
        if (socket) {
          //emit offer
          socket.emit("webrtcSignal", {
            sdp: data,
            ongoingCall,
            isCaller: false,
          });
        }
      });
    },
    [socket, currentSocketUser]
  );

  //calling socket
  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [user]);

  useEffect(() => {
    if (socket === null) return;
    if (socket.connected) onConnect();
    function onConnect() {
      setSocketConnected(true);
    }
    function onDisconnect() {
      setSocketConnected(false);
    }
    socket.on("connect", onConnect);
    socket.on("disConnect", onDisconnect);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disConnect", onDisconnect);
    };
  }, [socket]);

  //set online users
  useEffect(() => {
    if (!socket || !isSocketConnected) return;
    socket.emit("addNewUser", user);
    socket.on("getUsers", (res) => {
      setOnlineUsers(res);
    });
    return () => {
      socket.off("getUsers", (res) => {
        setOnlineUsers(res);
      });
    };
  }, [socket, isSocketConnected, user]);

  //calls
  useEffect(() => {
    if (!socket || !isSocketConnected) return;

    socket.on("incomingCall", onIncomingCall);
    socket.on("webrtcSignal", completePeerConnection);
    socket.on("hangup", handleHangup);
    return () => {
      socket.off("incomingCall", onIncomingCall);
      socket.off("webrtcSignal", completePeerConnection);
      socket.off("hangup", handleHangup);
    };
  }, [socket, isSocketConnected, user, onIncomingCall, completePeerConnection]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    if (isCallEnded) {
      timeout = setTimeout(() => {
        setIsCallEnded(false);
      }, 2000);
    }
    return () => clearTimeout(timeout);
  }, [isCallEnded]);

  return (
    <SocketContext.Provider
      value={{
        onlineUsers,
        ongoingCall,
        localStream,
        peer,
        isCallEnded,
        handleCall,
        handleJoinCall,
        handleHangup,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (context === null) {
    throw new Error("useSocket must be used within a socketContextProvider");
  }
  return context;
};
