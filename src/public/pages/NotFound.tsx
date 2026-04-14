import { ArrowLeft, Compass, Shield, Store } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import projectLogo from '../../assets/project-logo.png'

type QuickLink = {
  to: string
  label: string
  description: string
  icon: typeof Compass
}

export function NotFound() {
  const location = useLocation()
  const pathname = location.pathname

  const quickLinks: QuickLink[] = pathname.startsWith('/admin')
    ? [
        {
          to: '/admin',
          label: 'Админ-панель',
          description: 'Вернуться в основной раздел HQ',
          icon: Shield
        },
        {
          to: '/admin/login',
          label: 'Вход для HQ',
          description: 'Открыть страницу авторизации',
          icon: ArrowLeft
        }
      ]
    : pathname.startsWith('/partner')
      ? [
          {
            to: '/partner/dashboard',
            label: 'Кабинет партнёра',
            description: 'Перейти в основной раздел партнёра',
            icon: Store
          },
          {
            to: '/partner/login',
            label: 'Вход для партнёра',
            description: 'Открыть страницу авторизации',
            icon: ArrowLeft
          }
        ]
      : [
          {
            to: '/',
            label: 'На главную',
            description: 'Вернуться к публичной витрине',
            icon: Compass
          },
          {
            to: '/partner/login',
            label: 'Партнёрский вход',
            description: 'Открыть кабинет франчайзи',
            icon: Store
          },
          {
            to: '/admin/login',
            label: 'Вход HQ',
            description: 'Перейти в админ-панель',
            icon: Shield
          }
        ]

  return (
    <div className="relative min-h-[100svh] overflow-hidden bg-black text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.22),_transparent_34%),radial-gradient(circle_at_80%_20%,_rgba(255,255,255,0.08),_transparent_24%),linear-gradient(180deg,_#030712_0%,_#02040a_100%)]" />
      <div className="absolute inset-x-0 top-[-18rem] h-[28rem] bg-blue-500/10 blur-3xl" />

      <div className="relative mx-auto flex min-h-[100svh] w-full max-w-6xl items-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid w-full gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,420px)] lg:items-end">
          <section className="rounded-[2rem] border border-white/10 bg-white/5 p-7 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-10">
            <Link
              to="/"
              className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/75 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
            >
              <img src={projectLogo} alt="STONES" className="h-5 w-auto object-contain invert" />
              STONES
            </Link>

            <div className="mt-8 max-w-2xl">
              <p className="text-sm uppercase tracking-[0.4em] text-blue-400">Ошибка маршрута</p>
              <h1 className="mt-4 text-5xl font-light tracking-[0.08em] text-white sm:text-6xl">404</h1>
              <p className="mt-5 text-xl font-light leading-relaxed text-white/88 sm:text-2xl">
                Такой страницы нет или ссылка устарела.
              </p>
              <p className="mt-4 max-w-xl text-sm leading-7 text-white/60 sm:text-base">
                Проверьте адрес или перейдите в нужный раздел через быстрые действия ниже.
                Публичная витрина, кабинет партнёра и HQ доступны по отдельным маршрутам.
              </p>
            </div>

            <div className="mt-8 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/70">
              <span className="text-white/45">Запрошенный путь:</span>{' '}
              <code className="font-mono text-white">{pathname}</code>
            </div>
          </section>

          <aside className="rounded-[2rem] border border-white/10 bg-black/35 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-7">
            <p className="text-sm uppercase tracking-[0.28em] text-white/45">Быстрый переход</p>
            <div className="mt-5 space-y-3">
              {quickLinks.map(({ to, label, description, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  className="group flex items-start gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 transition hover:border-blue-400/40 hover:bg-white/10"
                >
                  <div className="mt-0.5 rounded-xl border border-white/10 bg-white/5 p-2 text-blue-400 transition group-hover:border-blue-400/30 group-hover:bg-blue-400/10">
                    <Icon size={18} />
                  </div>
                  <div>
                    <div className="text-base font-medium text-white">{label}</div>
                    <div className="mt-1 text-sm leading-6 text-white/55">{description}</div>
                  </div>
                </Link>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
