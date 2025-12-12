import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { TopBar } from '@/components/top-bar'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
    title: 'Internet Fragility Monitor',
    description: 'Centralized, independent tool to check for incidents affecting the internet at large.',
    icons: {
        icon: '/favicon.svg',
    },
    openGraph: {
        title: 'Internet Fragility Monitor',
        description: 'Centralized, independent tool to check for incidents affecting the internet at large.',
        type: 'website',
        locale: 'en_US',
        siteName: 'Internet Fragility Monitor',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Internet Fragility Monitor',
        description: 'Centralized, independent tool to check for incidents affecting the internet at large.',
    },
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en">
            <body className={inter.className}>
                <div className="fixed inset-0 z-[-1]">
                    <div
                        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-90"
                        style={{ backgroundImage: 'url(/background.png)' }}
                    />
                    <div className="absolute inset-0 bg-background/40 backdrop-blur-[1px]" />
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/20 to-background/60" />
                </div>
                <TopBar />
                {children}
            </body>
        </html>
    )
}
