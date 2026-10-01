import {cn} from '@/lib/utils'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardDescription, CardHeader, CardTitle,} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {useState} from 'react'
import {supabase} from "@/lib/supabase";
import {useNavigate} from "react-router-dom";

export function ResetPasswordForm({className, ...props}: React.ComponentPropsWithoutRef<'div'>) {
    const [password, setPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const navigate = useNavigate();

    const handleForgotPassword = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)
        setError(null)

        try {
            const {error} = await supabase.auth.updateUser({password})
            if (error) throw error
            // Update this route to redirect to an authenticated route. The user already has an active session.
            navigate('/')
        } catch (error: unknown) {
            setError(error instanceof Error ? error.message : 'An error occurred')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className={cn('flex flex-col gap-6', className)} {...props}>
            <Card>
                <CardHeader>
                    <CardTitle className="text-2xl">Reset Your Password</CardTitle>
                    <CardDescription>Please enter your new password below.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleForgotPassword}>
                        <div className="flex flex-col gap-6">
                            <div className="grid gap-2">
                                <Label htmlFor="password">New password</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    placeholder="New password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                            </div>
                            {error && <p className="text-sm text-red-500">{error}</p>}
                            <Button type="submit" className="w-full" disabled={isLoading}>
                                {isLoading ? 'Saving...' : 'Save new password'}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
