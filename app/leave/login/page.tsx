import { redirect } from "next/navigation";
import { getLeaveStaffId } from "@/lib/leave-auth";
import StaffLeaveLoginForm from "@/components/staff-leave-login-form";

export default function StaffLeaveLoginPage() {
  if (getLeaveStaffId()) redirect("/leave");
  return (
    <main className="min-h-screen bg-[#FAFAF7] px-4 py-10 flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1F4D47] text-xl text-white">NA</div>
          <h1 className="text-2xl font-semibold text-[#1F4D47]" style={{ fontFamily: "Fredoka" }}>Staff leave portal</h1>
          <p className="mt-1 text-sm text-[#74746E]">Request leave and review your attendance</p>
        </div>
        <StaffLeaveLoginForm />
      </div>
    </main>
  );
}