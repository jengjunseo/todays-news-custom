import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <section className="page-stack" aria-labelledby="login-title">
      <div className="eyebrow">개인용 앱</div>
      <h1 id="login-title">다시 오셨네요</h1>
      <p className="lede">설정한 개인 비밀번호로 브리핑을 엽니다.</p>
      <LoginForm />
    </section>
  );
}
