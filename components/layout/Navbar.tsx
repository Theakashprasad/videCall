"use client";
import React from "react";
import { Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth, UserButton } from "@clerk/nextjs";
import { Button } from "../ui/button";
import Container from "./Container";

const Navbar = () => {
  const router = useRouter();
  const { userId } = useAuth();
  return (
    <div className="sticky top-0 border border-b-primary/10">
      <Container>
        <div className="flex justify-between items-center">
          <div
            className="flex items-center gap-1 cursor-pointer"
            onClick={() => router.push("/")}
          >
            <Video />
            <div className="font-bold text-xl">vid chat</div>
          </div>
          <div className="flex gap-3 items-center">
            <UserButton />
            {!userId && (
              <>
                <Button
                  onClick={() => router.push("/sign-in")}
                  size="sm"
                  variant="outline"
                >
                  signIn
                </Button>
                <Button onClick={() => router.push("/sign-up")} size="sm">
                  signUp
                </Button>
              </>
            )}
          </div>
        </div>
      </Container>
    </div>
  );
};

export default Navbar;
