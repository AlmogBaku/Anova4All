import React, {createContext, useContext, useEffect, useState} from 'react'
import {Session, User} from '@supabase/supabase-js'
import {supabase} from '@/lib/supabase'
import {useNavigate} from "react-router-dom";

interface AuthContextType {
    session: Session | null
    user: User | null
    loading: boolean
    signOut: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({children}) => {
    const [session, setSession] = useState<Session | null>(null)
    const [user, setUser] = useState<User | null>(null)
    const [loading, setLoading] = useState(true)

    const navigate = useNavigate()

    const signOut = async () => {
        await supabase.auth.signOut();
        navigate('/login');
    };

    useEffect(() => {
        const getSession = async () => {
            const {data: {session}} = await supabase.auth.getSession();
            setSession(session)
            setUser(session?.user ?? null)
            setLoading(false)
        }

        getSession()

        const {data: authListener} = supabase.auth.onAuthStateChange(
            (_event, session) => {
                setSession(session)
                setUser(session?.user ?? null)
                setLoading(false)
            }
        )

        return () => {
            authListener?.subscription.unsubscribe()
        }
    }, [])

    const value = {
        session,
        user,
        loading,
        signOut,
    }

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
    const context = useContext(AuthContext)
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider')
    }
    return context
}
