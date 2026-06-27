import { SignUp } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="flex justify-center items-center h-screen bg-muted/30">
      <SignUp />
    </div>
  );
}
